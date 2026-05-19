package org.marly.mavigo.service.journey;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import org.marly.mavigo.controller.dto.TaskDetailDto;
import org.marly.mavigo.models.journey.Journey;
import org.marly.mavigo.models.journey.JourneyPoint;
import org.marly.mavigo.models.journey.JourneySegment;
import org.marly.mavigo.models.journey.JourneyStatus;
import org.marly.mavigo.models.shared.GeoPoint;
import org.marly.mavigo.models.task.UserTask;
import org.marly.mavigo.repository.JourneyRepository;
import org.marly.mavigo.repository.UserTaskRepository;
import org.marly.mavigo.service.journey.dto.JourneyPlanningParameters;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Service pour optimiser les trajets en incluant des tâches comme waypoints.
 * Pour l'instant, on réalise une tâche à la fois (pas plusieurs simultanément).
 */
@Service
public class JourneyOptimizationService {

    private static final Logger LOGGER = LoggerFactory.getLogger(JourneyOptimizationService.class);

    private static final double MAX_TASK_OPTIMIZATION_DURATION_RATIO = 3.0;
    private static final long MAX_TASK_OPTIMIZATION_EXTRA_SECONDS = 45L * 60;

    private final JourneyPlanningService journeyPlanningService;
    private final JourneyRepository journeyRepository;
    private final UserTaskRepository userTaskRepository;

    public JourneyOptimizationService(
            JourneyPlanningService journeyPlanningService,
            JourneyRepository journeyRepository,
            UserTaskRepository userTaskRepository) {
        this.journeyPlanningService = journeyPlanningService;
        this.journeyRepository = journeyRepository;
        this.userTaskRepository = userTaskRepository;
    }

    /**
     * DTO tâche pour optimisation (id, title, locationQuery, locationHint,
     * completed).
     */
    public record TaskForOptimization(String id, String title, String locationQuery, GeoPoint locationHint,
            boolean completed) {
    }

    /** Info tâche incluse dans le résultat (pour IncludedTaskResponse). */
    public record IncludedTaskInfo(String id, String title, String locationQuery,
            Double locationLat, Double locationLng) {
    }

    /**
     * Calcule, pour chaque tâche de l'utilisateur, le trajet complet
     * Origin → Tâche → Destination, puis renvoie tous les chemins pour la tâche
     * gagnante.
     */
    public List<OptimizedJourneyResult> planOptimizedJourneyWithTasks(
            JourneyPlanningParameters parameters,
            List<UUID> taskIds) {
        if (taskIds == null || taskIds.isEmpty()) {
            return Collections.emptyList();
        }
        List<TaskForOptimization> tasks = new ArrayList<>();
        for (UUID taskId : taskIds) {
            UserTask ut = userTaskRepository.findById(taskId).orElse(null);
            if (ut == null || ut.getLocationHint() == null || ut.isCompleted())
                continue;
            tasks.add(new TaskForOptimization(
                    ut.getId().toString(),
                    ut.getTitle(),
                    ut.getLocationQuery(),
                    ut.getLocationHint(),
                    ut.isCompleted()));
        }
        return planOptimizedJourneyWithTaskList(parameters, tasks);
    }

    /**
     * Optimisation à partir de tâches Google (sans stockage en base).
     */
    public List<OptimizedJourneyResult> planOptimizedJourneyWithTaskDetails(
            JourneyPlanningParameters parameters,
            List<TaskDetailDto> taskDetails) {
        if (taskDetails == null || taskDetails.isEmpty()) {
            return Collections.emptyList();
        }
        List<TaskForOptimization> tasks = new ArrayList<>();
        for (TaskDetailDto dto : taskDetails) {
            if (dto.id() == null || dto.lat() == null || dto.lng() == null || dto.completed())
                continue;
            tasks.add(new TaskForOptimization(
                    dto.id(),
                    dto.title() != null ? dto.title() : "",
                    dto.locationQuery() != null ? dto.locationQuery() : "",
                    new GeoPoint(dto.lat(), dto.lng()),
                    dto.completed()));
        }
        return planOptimizedJourneyWithTaskList(parameters, tasks);
    }

    private List<OptimizedJourneyResult> planOptimizedJourneyWithTaskList(
            JourneyPlanningParameters parameters,
            List<TaskForOptimization> tasks) {
        if (tasks.isEmpty()) {
            LOGGER.debug("No tasks with location, returning empty list");
            return Collections.emptyList();
        }
        LOGGER.info("Computing all paths for {} tasks, then selecting fastest", tasks.size());
        LocalDateTime initialDeparture = parameters.departureDateTime();
        List<OptimizedJourneyResult> candidates = new ArrayList<>();
        for (TaskForOptimization task : tasks) {
            try {
                OptimizedJourneyResult result = calculateJourneyWithTaskOpt(
                        parameters, task, initialDeparture);
                if (result != null) {
                    candidates.add(result);
                    LOGGER.debug("Journey with task '{}' (id={}): total {}s",
                            task.title(), task.id(), result.totalDurationSeconds());
                }
            } catch (Exception e) {
                LOGGER.warn("Failed to compute journey with task {} ({}): {}",
                        task.id(), task.title(), e.getMessage());
            }
        }
        if (candidates.isEmpty()) {
            return Collections.emptyList();
        }
        List<OptimizedJourneyResult> sorted = candidates.stream()
                .sorted(Comparator.comparingLong(OptimizedJourneyResult::totalDurationSeconds))
                .toList();
        OptimizedJourneyResult best = sorted.get(0);
        IncludedTaskInfo bestTask = best.includedTasks().get(0);
        LOGGER.info("Fastest path integrates task '{}' (total {}s, base {}s, +{}s)",
                bestTask.title(), best.totalDurationSeconds(), best.baseDurationSeconds(),
                best.totalDurationSeconds() - best.baseDurationSeconds());
        TaskForOptimization bestTaskOpt = tasks.stream()
                .filter(t -> t.id().equals(best.includedTasks().get(0).id()))
                .findFirst().orElse(null);
        if (bestTaskOpt == null) {
            return List.of(best);
        }
        List<OptimizedJourneyResult> allPaths = calculateAllPathsForTaskOpt(
                parameters, bestTaskOpt, initialDeparture, best.baseDurationSeconds());
        return allPaths.isEmpty() ? List.of(best) : allPaths;
    }

    private static final int MAX_PATHS_PER_TASK = 5;

    public record OptimizedJourneyResult(
            Journey journey,
            List<IncludedTaskInfo> includedTasks,
            long totalDurationSeconds,
            long baseDurationSeconds) {
    }

    private List<OptimizedJourneyResult> calculateAllPathsForTaskOpt(
            JourneyPlanningParameters parameters,
            TaskForOptimization task,
            LocalDateTime initialDeparture,
            long baseDurationSeconds) {
        if (task == null || task.locationHint() == null)
            return List.of();

        String taskQuery = getTaskLocationQuery(task);
        List<Journey> segment1Journeys = planSegment1(parameters, taskQuery, initialDeparture);
        if (segment1Journeys.isEmpty())
            return List.of();

        List<OptimizedJourneyResult> results = new ArrayList<>();
        IncludedTaskInfo info = new IncludedTaskInfo(
                task.id(), task.title(), task.locationQuery(),
                task.locationHint() != null ? task.locationHint().getLatitude() : null,
                task.locationHint() != null ? task.locationHint().getLongitude() : null);
        int maxSeg1 = Math.min(MAX_PATHS_PER_TASK, segment1Journeys.size());

        for (int i = 0; i < maxSeg1; i++) {
            Journey seg1 = segment1Journeys.get(i);
            LocalDateTime taskArrival = seg1.getPlannedArrival().toLocalDateTime();
            JourneyPlanningParameters segment2Params = new JourneyPlanningParameters(
                    parameters.userId(), taskQuery, parameters.destinationQuery(), taskArrival,
                    parameters.preferences(),
                    parameters.ecoModeEnabled(),
                    parameters.wheelchairAccessible());
            List<Journey> segment2Journeys = journeyPlanningService.planAndPersist(segment2Params);
            if (segment2Journeys.isEmpty())
                continue;

            Journey seg2 = segment2Journeys.get(0);
            Journey aggregated = createAggregatedJourney(parameters, List.of(seg1, seg2),
                    initialDeparture, seg2.getPlannedArrival());
            results.add(new OptimizedJourneyResult(aggregated, List.of(info),
                    getDurationSeconds(seg1) + getDurationSeconds(seg2), baseDurationSeconds));
        }
        results.sort(Comparator.comparingLong(OptimizedJourneyResult::totalDurationSeconds));
        LOGGER.info("Returning {} path(s) for task '{}'", results.size(), task.title());
        return results;
    }

    private OptimizedJourneyResult calculateJourneyWithTaskOpt(
            JourneyPlanningParameters parameters,
            TaskForOptimization task,
            LocalDateTime initialDeparture) {
        if (task == null || task.locationHint() == null)
            return null;

        String taskQuery = getTaskLocationQuery(task);
        List<Journey> segment1Journeys = planSegment1(parameters, taskQuery, initialDeparture);
        if (segment1Journeys.isEmpty())
            return null;

        Journey bestSegment1 = segment1Journeys.get(0);
        LocalDateTime taskArrival = bestSegment1.getPlannedArrival().toLocalDateTime();
        JourneyPlanningParameters segment2Params = new JourneyPlanningParameters(
                parameters.userId(), taskQuery, parameters.destinationQuery(), taskArrival, parameters.preferences(),
                parameters.ecoModeEnabled(),
                parameters.wheelchairAccessible());
        List<Journey> segment2Journeys = journeyPlanningService.planAndPersist(segment2Params);
        if (segment2Journeys.isEmpty())
            return null;

        Journey bestSegment2 = segment2Journeys.get(0);
        Journey totalJourney = createAggregatedJourney(parameters, List.of(bestSegment1, bestSegment2),
                initialDeparture, bestSegment2.getPlannedArrival());

        long totalDuration = getDurationSeconds(bestSegment1) + getDurationSeconds(bestSegment2);
        JourneyPlanningParameters baseParams = new JourneyPlanningParameters(
                parameters.userId(), parameters.originQuery(), parameters.destinationQuery(),
                initialDeparture, parameters.preferences(),
                parameters.ecoModeEnabled(),
                parameters.wheelchairAccessible());
        List<Journey> baseJourneys = journeyPlanningService.planAndPersist(baseParams);
        long baseDuration = baseJourneys.isEmpty() ? totalDuration : getDurationSeconds(baseJourneys.get(0));

        if (!isReasonableTaskDetour(totalDuration, baseDuration)) {
            LOGGER.debug(
                    "Task '{}' skipped: detour too large (total {}s vs base {}s)",
                    task.title(),
                    totalDuration,
                    baseDuration);
            return null;
        }

        return new OptimizedJourneyResult(totalJourney,
                List.of(new IncludedTaskInfo(
                        task.id(), task.title(), task.locationQuery(),
                        task.locationHint() != null ? task.locationHint().getLatitude() : null,
                        task.locationHint() != null ? task.locationHint().getLongitude() : null)),
                totalDuration, baseDuration);
    }

    private String getTaskLocationQuery(TaskForOptimization task) {
        if (task.locationQuery() != null && !task.locationQuery().isBlank()) {
            return task.locationQuery();
        }
        return String.format(java.util.Locale.ROOT, "%.6f,%.6f",
                task.locationHint().getLatitude(), task.locationHint().getLongitude());
    }

    private List<Journey> planSegment1(JourneyPlanningParameters parameters, String taskQuery,
            LocalDateTime initialDeparture) {
        JourneyPlanningParameters segment1Params = new JourneyPlanningParameters(
                parameters.userId(), parameters.originQuery(), taskQuery, initialDeparture, parameters.preferences(),
                parameters.ecoModeEnabled(),
                parameters.wheelchairAccessible());
        return journeyPlanningService.planAndPersist(segment1Params);
    }

    /**
     * Crée un trajet agrégé à partir de plusieurs segments.
     */
    private Journey createAggregatedJourney(
            JourneyPlanningParameters parameters,
            List<Journey> segments,
            LocalDateTime departure,
            OffsetDateTime arrival) {

        if (segments.isEmpty()) {
            throw new IllegalArgumentException("Cannot create journey from empty segments");
        }

        Journey firstSegment = segments.get(0);
        Journey lastSegment = segments.get(segments.size() - 1);

        Journey aggregated = new Journey(
                firstSegment.getUser(),
                firstSegment.getOriginLabel(),
                lastSegment.getDestinationLabel(),
                departure.atOffset(ZoneOffset.systemDefault().getRules().getOffset(java.time.Instant.now())),
                arrival);

        // Fusionner tous les segments de tous les trajets
        List<JourneySegment> allSegments = new ArrayList<>();
        int sequenceOrder = 0;
        for (Journey segment : segments) {
            if (segment.getSegments() != null) {
                for (JourneySegment seg : segment.getSegments()) {
                    JourneySegment newSeg = new JourneySegment(aggregated, sequenceOrder++, seg.getSegmentType());
                    newSeg.setTransitMode(seg.getTransitMode());
                    newSeg.setLineCode(seg.getLineCode());
                    newSeg.setLineName(seg.getLineName());
                    newSeg.setLineColor(seg.getLineColor());
                    newSeg.setNetworkName(seg.getNetworkName());
                    newSeg.setScheduledDeparture(seg.getScheduledDeparture());
                    newSeg.setScheduledArrival(seg.getScheduledArrival());
                    newSeg.setDurationSeconds(seg.getDurationSeconds());
                    newSeg.setDistanceMeters(seg.getDistanceMeters());
                    newSeg.setHasAirConditioning(seg.getHasAirConditioning());
                    newSeg.setPrimSectionId(seg.getPrimSectionId());
                    // Copy points
                    int pointSeq = 0;
                    for (JourneyPoint point : seg.getPoints()) {
                        JourneyPoint newPoint = new JourneyPoint(newSeg, pointSeq++, point.getPointType(),
                                point.getName());
                        newPoint.setPrimStopPointId(point.getPrimStopPointId());
                        newPoint.setPrimStopAreaId(point.getPrimStopAreaId());
                        newPoint.setCoordinates(point.getCoordinates());
                        newPoint.setScheduledArrival(point.getScheduledArrival());
                        newPoint.setScheduledDeparture(point.getScheduledDeparture());
                        newPoint.setStatus(point.getStatus());
                        newSeg.addPoint(newPoint);
                    }
                    allSegments.add(newSeg);
                }
            }
        }

        aggregated.replaceSegments(allSegments);
        aggregated.setStatus(JourneyStatus.PLANNED);
        aggregated = journeyRepository.save(aggregated);

        return aggregated;
    }

    private static boolean isReasonableTaskDetour(long totalDurationSeconds, long baseDurationSeconds) {
        if (baseDurationSeconds <= 0 || totalDurationSeconds <= baseDurationSeconds) {
            return true;
        }
        long extra = totalDurationSeconds - baseDurationSeconds;
        if (extra > MAX_TASK_OPTIMIZATION_EXTRA_SECONDS) {
            return false;
        }
        double ratio = (double) totalDurationSeconds / (double) baseDurationSeconds;
        return ratio <= MAX_TASK_OPTIMIZATION_DURATION_RATIO;
    }

    /** Durée totale du trajet en secondes. */
    private long getDurationSeconds(Journey journey) {
        if (journey.getPlannedDeparture() != null && journey.getPlannedArrival() != null) {
            return java.time.Duration.between(
                    journey.getPlannedDeparture(),
                    journey.getPlannedArrival()).getSeconds();
        }
        // Fallback: additionner les durées des segments
        if (journey.getSegments() != null) {
            return journey.getSegments().stream()
                    .mapToLong(seg -> seg.getDurationSeconds() != null ? seg.getDurationSeconds() : 0L)
                    .sum();
        }
        return 0L;
    }
}
