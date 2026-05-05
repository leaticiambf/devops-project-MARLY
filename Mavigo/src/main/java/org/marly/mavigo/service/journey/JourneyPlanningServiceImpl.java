package org.marly.mavigo.service.journey;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Collectors;

import org.hibernate.Hibernate;
import org.marly.mavigo.client.prim.PrimApiClient;
import org.marly.mavigo.client.prim.PrimApiException;
import org.marly.mavigo.client.prim.dto.PrimJourneyPlanDto;
import org.marly.mavigo.client.prim.model.PrimJourneyRequest;
import org.marly.mavigo.models.disruption.Disruption;
import org.marly.mavigo.models.journey.Journey;
import org.marly.mavigo.models.journey.JourneyPoint;
import org.marly.mavigo.models.journey.JourneyPointType;
import org.marly.mavigo.models.journey.JourneySegment;
import org.marly.mavigo.models.journey.JourneyStatus;
import org.marly.mavigo.models.journey.SegmentType;
import org.marly.mavigo.models.journey.TransitMode;
import org.marly.mavigo.models.shared.GeoPoint;
import org.marly.mavigo.models.stoparea.StopArea;
import org.marly.mavigo.models.user.User;
import org.marly.mavigo.repository.JourneyRepository;
import org.marly.mavigo.repository.UserRepository;
import org.marly.mavigo.service.journey.dto.JourneyPlanningContext;
import org.marly.mavigo.service.journey.dto.JourneyPlanningParameters;
import org.marly.mavigo.service.journey.dto.JourneyPreferences;
import org.marly.mavigo.service.stoparea.StopAreaService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class JourneyPlanningServiceImpl implements JourneyPlanningService {

    private static final Logger LOGGER = LoggerFactory.getLogger(JourneyPlanningServiceImpl.class);
    private static final double SHORT_DIRECT_WALK_MAX_METERS = 1500.0;
    private static final double WALKING_SPEED_METERS_PER_SECOND = 1.35;

    private final PrimApiClient primApiClient;
    private final StopAreaService stopAreaService;
    private final JourneyRepository journeyRepository;
    private final UserRepository userRepository;
    private final JourneyAssembler journeyAssembler;
    private final PrimJourneyRequestFactory primJourneyRequestFactory;
    private final JourneyResultFilter journeyResultFilter;

    public JourneyPlanningServiceImpl(PrimApiClient primApiClient,
            StopAreaService stopAreaService,
            JourneyRepository journeyRepository,
            UserRepository userRepository,
            JourneyAssembler journeyAssembler,
            PrimJourneyRequestFactory primJourneyRequestFactory,
            JourneyResultFilter journeyResultFilter) {
        this.primApiClient = primApiClient;
        this.stopAreaService = stopAreaService;
        this.journeyRepository = journeyRepository;
        this.userRepository = userRepository;
        this.journeyAssembler = journeyAssembler;
        this.primJourneyRequestFactory = primJourneyRequestFactory;
        this.journeyResultFilter = journeyResultFilter;
    }

    @Override
    public List<Journey> planAndPersist(JourneyPlanningParameters parameters) {
        StopArea origin = stopAreaService.findOrCreateByQuery(parameters.originQuery());
        StopArea destination = stopAreaService.findOrCreateByQuery(parameters.destinationQuery());
        StopArea displayOrigin = withLabelOverride(origin, parameters.originLabelOverride());
        StopArea displayDestination = withLabelOverride(destination, parameters.destinationLabelOverride());

        User user = userRepository.findById(parameters.userId())
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + parameters.userId()));

        JourneyPlanningContext context = new JourneyPlanningContext(user, displayOrigin, displayDestination, parameters);

        LOGGER.info("Planning journey for user {} from '{}' to '{}' at {}",
                parameters.userId(),
                displayOrigin.getName(),
                displayDestination.getName(),
                parameters.departureDateTime());

        List<PrimJourneyPlanDto> options;
        try {
            var journeyRequest = primJourneyRequestFactory.create(context);
            options = primApiClient.calculateJourneyPlans(journeyRequest);

            boolean comfortEnabled = parameters.preferences().comfortModeEnabled();
            options = journeyResultFilter.filterByComfortProfile(options, context, comfortEnabled);

            if (options.isEmpty()) {
                throw new PrimApiException("No journey options match the requested parameters or comfort criteria");
            }
        } catch (PrimApiException ex) {
            Journey directWalk = createShortDirectWalkingJourneyIfEligible(
                    user,
                    displayOrigin,
                    displayDestination,
                    parameters);
            if (directWalk != null) {
                return List.of(directWalk);
            }
            throw ex;
        }

        List<PrimJourneyPlanDto> topOptions = options.stream().limit(3).toList();
        List<Journey> savedJourneys = new java.util.ArrayList<>();

        for (PrimJourneyPlanDto selected : topOptions) {
            Journey journey = journeyAssembler.assemble(
                    user,
                            displayOrigin,
                            displayDestination,
                    selected,
                    parameters.preferences());

            journey.setStatus(JourneyStatus.PLANNED);
            Journey savedJourney = journeyRepository.save(journey);

            Hibernate.initialize(savedJourney.getDisruptions());
            for (JourneySegment segment : savedJourney.getSegments()) {
                Hibernate.initialize(segment.getPoints());
            }

            savedJourneys.add(savedJourney);

            LOGGER.info("Persisted journey {} using Prim itinerary {}", savedJourney.getId(), selected.journeyId());
        }

        return savedJourneys;
    }

    private StopArea withLabelOverride(StopArea area, String labelOverride) {
        if (labelOverride == null || labelOverride.isBlank()) {
            return area;
        }
        return new StopArea(area.getExternalId(), labelOverride.trim(), area.getCoordinates());
    }

    private Journey createShortDirectWalkingJourneyIfEligible(
            User user,
            StopArea origin,
            StopArea destination,
            JourneyPlanningParameters parameters) {
        GeoPoint originPoint = origin.getCoordinates();
        GeoPoint destinationPoint = destination.getCoordinates();
        if (originPoint == null || destinationPoint == null ||
                !originPoint.isComplete() || !destinationPoint.isComplete()) {
            return null;
        }

        double distanceMeters = calculateDistance(
                originPoint.getLatitude(), originPoint.getLongitude(),
                destinationPoint.getLatitude(), destinationPoint.getLongitude());
        if (distanceMeters > SHORT_DIRECT_WALK_MAX_METERS) {
            return null;
        }

        int durationSeconds = Math.max(60, (int) Math.ceil(distanceMeters / WALKING_SPEED_METERS_PER_SECOND));
        OffsetDateTime departure = parameters.departureDateTime()
                .atZone(ZoneId.systemDefault())
                .toOffsetDateTime();
        OffsetDateTime arrival = departure.plusSeconds(durationSeconds);

        Journey journey = new Journey(user, origin.getName(), destination.getName(), departure, arrival);
        journey.setOriginCoordinate(new GeoPoint(originPoint.getLatitude(), originPoint.getLongitude()));
        journey.setDestinationCoordinate(new GeoPoint(destinationPoint.getLatitude(), destinationPoint.getLongitude()));
        journey.setComfortModeEnabled(parameters.preferences().comfortModeEnabled());
        journey.setEcoModeEnabled(parameters.preferences().ecoModeEnabled());
        journey.setNamedComfortSettingId(parameters.preferences().namedComfortSettingId());
        journey.setPrimItineraryId("direct-walking-fallback");
        journey.setStatus(JourneyStatus.PLANNED);

        JourneySegment segment = new JourneySegment(journey, 0, SegmentType.WALKING);
        segment.setTransitMode(TransitMode.WALK);
        segment.setScheduledDeparture(departure);
        segment.setScheduledArrival(arrival);
        segment.setDurationSeconds(durationSeconds);
        segment.setDistanceMeters((int) Math.round(distanceMeters));
        segment.setHasAirConditioning(false);

        JourneyPoint originJourneyPoint = new JourneyPoint(segment, 0, JourneyPointType.ORIGIN, origin.getName());
        originJourneyPoint.setCoordinates(new GeoPoint(originPoint.getLatitude(), originPoint.getLongitude()));
        originJourneyPoint.setScheduledDeparture(departure);
        segment.addPoint(originJourneyPoint);

        JourneyPoint destinationJourneyPoint = new JourneyPoint(
                segment,
                1,
                JourneyPointType.DESTINATION,
                destination.getName());
        destinationJourneyPoint.setCoordinates(new GeoPoint(
                destinationPoint.getLatitude(),
                destinationPoint.getLongitude()));
        destinationJourneyPoint.setScheduledArrival(arrival);
        segment.addPoint(destinationJourneyPoint);

        journey.addSegment(segment);
        Journey savedJourney = journeyRepository.save(journey);
        Hibernate.initialize(savedJourney.getDisruptions());
        for (JourneySegment savedSegment : savedJourney.getSegments()) {
            Hibernate.initialize(savedSegment.getPoints());
        }

        LOGGER.info(
                "Persisted short direct walking journey {} from '{}' to '{}' ({}m)",
                savedJourney.getId(),
                origin.getName(),
                destination.getName(),
                Math.round(distanceMeters));
        return savedJourney;
    }

    private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
        final int earthRadiusMeters = 6_371_000;
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                        * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return earthRadiusMeters * c;
    }

    /**
     * Updates an existing journey when a disruption is reported.
     */
    @Transactional
    public List<Journey> updateJourneyWithDisruption(UUID journeyId, Disruption disruption,
            Double userLat, Double userLng, String manualOrigin) {

        Journey journey = journeyRepository.findWithSegmentsById(journeyId)
                .orElseThrow(() -> new IllegalArgumentException("Journey not found: " + journeyId));
        // Initialize points separately to avoid MultipleBagFetchException
        for (JourneySegment segment : journey.getSegments()) {
            Hibernate.initialize(segment.getPoints());
        }

        // Check if journey is impacted by the disruption
        boolean isGeneric = "General Disruption".equals(disruption.getEffectedLine());
        boolean impacted = isGeneric || journey.isLineUsed(disruption.getEffectedLine());

        if (!impacted) {
            return java.util.Collections.singletonList(journey);
        }

        journey.addDisruption(disruption);

        // Determine new origin: GPS > manual override > original origin
        StopArea origin;
        String originQuery;

        if (userLat != null && userLng != null) {
            originQuery = "Current Location";
            String tempId = String.format(Locale.ROOT, "coord:%.6f;%.6f", userLng, userLat);
            GeoPoint location = new GeoPoint(userLat, userLng);
            origin = new StopArea(tempId, "Current Location", location);
        } else if (manualOrigin != null && !manualOrigin.isBlank()) {
            originQuery = manualOrigin;
            origin = stopAreaService.findOrCreateByQuery(originQuery);
        } else {
            originQuery = journey.getOriginLabel();
            origin = stopAreaService.findOrCreateByQuery(originQuery);
        }

        StopArea destination = stopAreaService.findOrCreateByQuery(journey.getDestinationLabel());

        JourneyPreferences preferences = new JourneyPreferences(
                journey.isComfortModeEnabled(),
                journey.isEcoModeEnabled(),
                journey.getNamedComfortSettingId());

        JourneyPlanningParameters params = new JourneyPlanningParameters(
                journey.getUser().getId(),
                originQuery,
                journey.getDestinationLabel(),
                LocalDateTime.now(),
                preferences,
                journey.isEcoModeEnabled(),
                false);

        JourneyPlanningContext context = new JourneyPlanningContext(
                journey.getUser(),
                origin,
                destination,
                params);

        var request = primJourneyRequestFactory.create(context);

        List<PrimJourneyPlanDto> options = primApiClient.calculateJourneyPlans(request);

        boolean comfortEnabled = preferences.comfortModeEnabled();
        options = journeyResultFilter.filterByComfortProfile(options, context, comfortEnabled);

        if (options.isEmpty()) {
            return java.util.Collections.singletonList(journey);
        }

        List<PrimJourneyPlanDto> topOptions = options.stream().limit(3).toList();
        List<Journey> newJourneys = new java.util.ArrayList<>();

        for (PrimJourneyPlanDto selected : topOptions) {
            Journey newJourney = journeyAssembler.assemble(
                    journey.getUser(),
                    origin,
                    destination,
                    selected,
                    preferences);

            newJourney.setStatus(JourneyStatus.PLANNED);
            newJourney.addDisruption(disruption);

            Journey savedJourney = journeyRepository.save(newJourney);
            Hibernate.initialize(savedJourney.getDisruptions());
            for (JourneySegment segment : savedJourney.getSegments()) {
                Hibernate.initialize(segment.getPoints());
            }
            newJourneys.add(savedJourney);
        }

        return newJourneys;
    }

    /**
     * Recalculates journey from a new origin (the station after the disrupted one).
     */
    public List<Journey> recalculateFromNewOrigin(
            UUID userId,
            String newOriginStopAreaId,
            String destinationStopAreaId,
            JourneyPreferences preferences) {

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found: " + userId));

        StopArea origin = stopAreaService.findOrCreateByQuery(newOriginStopAreaId);
        StopArea destination = stopAreaService.findOrCreateByQuery(destinationStopAreaId);

        JourneyPreferences prefs = preferences != null ? preferences : JourneyPreferences.disabled();
        JourneyPlanningParameters params = new JourneyPlanningParameters(
                userId,
                newOriginStopAreaId,
                destinationStopAreaId,
                LocalDateTime.now(),
                prefs,
                preferences != null && preferences.ecoModeEnabled(),
                false);
        JourneyPlanningContext context = new JourneyPlanningContext(user, origin, destination, params);

        PrimJourneyRequest request = new PrimJourneyRequest(
                origin.getExternalId(),
                destination.getExternalId(),
                LocalDateTime.now());

        List<PrimJourneyPlanDto> options = primApiClient.calculateJourneyPlans(request);

        boolean comfortEnabled = preferences != null && preferences.comfortModeEnabled();
        options = journeyResultFilter.filterByComfortProfile(options, context, comfortEnabled);

        if (options.isEmpty()) {
            throw new PrimApiException("No journey options found from new origin");
        }

        List<PrimJourneyPlanDto> topOptions = options.stream().limit(3).toList();
        List<Journey> savedJourneys = new java.util.ArrayList<>();

        for (PrimJourneyPlanDto selected : topOptions) {
            Journey journey = journeyAssembler.assemble(user, origin, destination, selected, preferences);
            journey.setStatus(JourneyStatus.PLANNED);

            Journey savedJourney = journeyRepository.save(journey);
            Hibernate.initialize(savedJourney.getDisruptions());
            for (JourneySegment segment : savedJourney.getSegments()) {
                Hibernate.initialize(segment.getPoints());
            }

            savedJourneys.add(savedJourney);
        }

        return savedJourneys;
    }

    /**
     * Filters journey results to exclude journeys using a specific line.
     */
    public List<Journey> filterJourneysExcludingLine(List<Journey> journeys, String excludedLineCode) {
        return journeys.stream()
                .filter(j -> !j.isLineUsed(excludedLineCode))
                .collect(Collectors.toList());
    }
}
