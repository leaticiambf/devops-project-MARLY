package org.marly.mavigo.controller.dto;

import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.marly.mavigo.models.journey.Journey;
import org.marly.mavigo.models.journey.JourneyPoint;
import org.marly.mavigo.models.journey.JourneyPointType;
import org.marly.mavigo.models.journey.JourneySegment;
import org.marly.mavigo.models.journey.SegmentType;
import org.marly.mavigo.models.journey.TransitMode;
import org.marly.mavigo.models.shared.GeoPoint;
import org.marly.mavigo.models.task.UserTask;

public record JourneyResponse(
                UUID journeyId,
                UUID userId,
                String originLabel,
                String destinationLabel,
                OffsetDateTime plannedDeparture,
                OffsetDateTime plannedArrival,
                boolean comfortModeEnabled,
                String primItineraryId,
                String status,
                OffsetDateTime actualDeparture,
                OffsetDateTime actualArrival,
                int disruptionCount,
                JourneySummary summary,
                List<SegmentResponse> segments,
                List<TaskOnRouteResponse> tasksOnRoute,
                List<IncludedTaskResponse> includedTasks,
                Long baseDurationSeconds,
                List<BadgeResponse> newBadges,
                String intermediateQuery,
                OffsetDateTime intermediateDepartureTime) {

        public record BadgeResponse(String name, String description, String icon) {
        }

        public static JourneyResponse from(Journey journey) {
                return from(journey, Collections.emptyList(), Collections.emptyList());
        }

        public static JourneyResponse from(Journey journey, List<TaskOnRouteResponse> tasksOnRoute) {
                return from(journey, tasksOnRoute, Collections.emptyList());
        }

        public static JourneyResponse from(Journey journey, List<TaskOnRouteResponse> tasksOnRoute,
                        List<org.marly.mavigo.models.tracking.Badge> newBadges) {
                List<JourneySegment> journeySegments = journey.getSegments();
                List<SegmentResponse> segmentResponses = journeySegments.isEmpty()
                                ? Collections.emptyList()
                                : journeySegments.stream().map(JourneyResponse::fromSegment).toList();

                JourneySummary summary = createSummary(journey);

                List<BadgeResponse> badgeResponses = newBadges == null ? Collections.emptyList()
                                : newBadges.stream().map(
                                                b -> new BadgeResponse(b.getName(), b.getDescription(), b.getIcon()))
                                                .toList();

                return new JourneyResponse(
                                journey.getId(),
                                journey.getUser() != null ? journey.getUser().getId() : null,
                                journey.getOriginLabel(),
                                journey.getDestinationLabel(),
                                journey.getPlannedDeparture(),
                                journey.getPlannedArrival(),
                                journey.isComfortModeEnabled(),
                                journey.getPrimItineraryId(),
                                journey.getStatus().name(),
                                journey.getActualDeparture(),
                                journey.getActualArrival(),
                                journey.getDisruptionCount(),
                                summary,
                                segmentResponses,
                                tasksOnRoute == null ? Collections.emptyList() : tasksOnRoute,
                                Collections.emptyList(),
                                null,
                                badgeResponses,
                                journey.getIntermediateQuery(),
                                journey.getIntermediateDepartureTime());
        }

        public static JourneyResponse fromOptimized(
                        Journey journey,
                        List<TaskOnRouteResponse> tasksOnRoute,
                        List<IncludedTaskResponse> includedTasks,
                        Long baseDurationSeconds) {
                JourneyResponse base = from(journey, tasksOnRoute);
                return new JourneyResponse(
                                base.journeyId(),
                                base.userId(),
                                base.originLabel(),
                                base.destinationLabel(),
                                base.plannedDeparture(),
                                base.plannedArrival(),
                                base.comfortModeEnabled(),
                                base.primItineraryId(),
                                base.status(),
                                base.actualDeparture(),
                                base.actualArrival(),
                                base.disruptionCount(),
                                base.summary(),
                                base.segments(),
                                base.tasksOnRoute(),
                                includedTasks == null ? Collections.emptyList() : includedTasks,
                                baseDurationSeconds,
                                base.newBadges(),
                                base.intermediateQuery(),
                                base.intermediateDepartureTime());
        }

        private static JourneySummary createSummary(Journey journey) {
                List<JourneySegment> segments = journey.getSegments();
                int totalSegments = segments.size();
                int totalPoints = journey.getAllPoints().size();
                int transferCount = (int) journey.getTransferPoints().stream()
                                .filter(p -> p.getPointType() == JourneyPointType.TRANSFER_ARRIVAL)
                                .count();
                int disruptedCount = journey.getDisruptedPoints().size();
                Set<String> linesUsed = journey.getAllLineCodes();

                return new JourneySummary(totalSegments, totalPoints, transferCount, disruptedCount, linesUsed);
        }

        private static SegmentResponse fromSegment(JourneySegment segment) {
                List<PointResponse> points = segment.getPoints().stream()
                                .map(JourneyResponse::fromPoint)
                                .toList();

                return new SegmentResponse(
                                segment.getId(),
                                segment.getSequenceOrder(),
                                segment.getSegmentType(),
                                segment.getTransitMode(),
                                segment.getLineCode(),
                                segment.getLineName(),
                                segment.getLineColor(),
                                segment.getNetworkName(),
                                segment.getScheduledDeparture(),
                                segment.getScheduledArrival(),
                                segment.getDurationSeconds(),
                                segment.getDistanceMeters(),
                                segment.getHasAirConditioning(),
                                points);
        }

        private static PointResponse fromPoint(JourneyPoint point) {
                return new PointResponse(
                                point.getId(),
                                point.getSequenceInSegment(),
                                point.getPointType(),
                                point.getName(),
                                point.getPrimStopPointId(),
                                point.getPrimStopAreaId(),
                                latitude(point.getCoordinates()),
                                longitude(point.getCoordinates()),
                                point.getScheduledArrival(),
                                point.getScheduledDeparture(),
                                point.isDisrupted());
        }

        public static TaskOnRouteResponse fromTask(UserTask task, double distanceMeters) {
                GeoPoint p = task.getLocationHint();
                return new TaskOnRouteResponse(
                                task.getId(),
                                task.getTitle(),
                                task.getNotes(),
                                latitude(p),
                                longitude(p),
                                distanceMeters);
        }

        private static Double latitude(GeoPoint geoPoint) {
                return geoPoint != null ? geoPoint.getLatitude() : null;
        }

        private static Double longitude(GeoPoint geoPoint) {
                return geoPoint != null ? geoPoint.getLongitude() : null;
        }

        /**
         * Summary statistics for a journey.
         */
        public record JourneySummary(
                        int totalSegments,
                        int totalPoints,
                        int transferCount,
                        int disruptedCount,
                        Set<String> linesUsed) {
        }

        /**
         * Response for a single segment of the journey.
         */
        public record SegmentResponse(
                        UUID segmentId,
                        int sequenceOrder,
                        SegmentType segmentType,
                        TransitMode transitMode,
                        String lineCode,
                        String lineName,
                        String lineColor,
                        String networkName,
                        OffsetDateTime scheduledDeparture,
                        OffsetDateTime scheduledArrival,
                        Integer durationSeconds,
                        Integer distanceMeters,
                        Boolean hasAirConditioning,
                        List<PointResponse> points) {
        }

        /**
         * Response for a single point/stop in the journey.
         */
        public record PointResponse(
                        UUID pointId,
                        int sequenceInSegment,
                        JourneyPointType pointType,
                        String name,
                        String primStopPointId,
                        String primStopAreaId,
                        Double latitude,
                        Double longitude,
                        OffsetDateTime scheduledArrival,
                        OffsetDateTime scheduledDeparture,
                        boolean isDisrupted) {
        }

        /**
         * Response for a task on the route.
         */
        public record TaskOnRouteResponse(
                        UUID taskId,
                        String title,
                        String notes,
                        Double locationLat,
                        Double locationLng,
                        Double distanceMeters) {
        }

        public record IncludedTaskResponse(
                        UUID taskId,
                        String title,
                        String locationQuery,
                        Long additionalDurationSeconds,
                        String googleTaskId,
                        Double locationLat,
                        Double locationLng) {
        }
}
