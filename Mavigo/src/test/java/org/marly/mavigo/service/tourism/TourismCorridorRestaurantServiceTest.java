package org.marly.mavigo.service.tourism;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.marly.mavigo.models.journey.Journey;
import org.marly.mavigo.models.journey.JourneyPoint;
import org.marly.mavigo.models.journey.JourneyPointType;
import org.marly.mavigo.models.journey.JourneySegment;
import org.marly.mavigo.models.journey.SegmentType;
import org.marly.mavigo.models.shared.GeoPoint;
import org.marly.mavigo.repository.JourneyRepository;
import org.marly.mavigo.service.tourism.dto.NearbyRestaurantSearch;
import org.marly.mavigo.service.tourism.dto.TourismSuggestion;

class TourismCorridorRestaurantServiceTest {

    private JourneyRepository journeyRepository;
    private TourismSuggestionService tourismSuggestionService;
    private TourismCorridorRestaurantService service;

    @BeforeEach
    void setUp() {
        journeyRepository = mock(JourneyRepository.class);
        tourismSuggestionService = mock(TourismSuggestionService.class);
        service = new TourismCorridorRestaurantService(journeyRepository, tourismSuggestionService);
    }

    @Test
    void findAlongJourney_returnsEmptyWhenJourneyMissingOrGeometryInsufficient() {
        UUID journeyId = UUID.randomUUID();
        when(journeyRepository.findWithSegmentsById(journeyId)).thenReturn(Optional.empty());

        assertEquals(List.of(), service.findAlongJourney(journeyId));

        Journey journey = new Journey(null, "A", "B", OffsetDateTime.now(), OffsetDateTime.now().plusHours(1));
        when(journeyRepository.findWithSegmentsById(journeyId)).thenReturn(Optional.of(journey));

        assertEquals(List.of(), service.findAlongJourney(journeyId));
    }

    @Test
    void findAlongJourney_fallsBackToOriginAndDestinationCoordinates() {
        UUID journeyId = UUID.randomUUID();
        Journey journey = new Journey(null, "A", "B", OffsetDateTime.now(), OffsetDateTime.now().plusHours(1));
        journey.setOriginCoordinate(new GeoPoint(48.8566, 2.3522));
        journey.setDestinationCoordinate(new GeoPoint(48.8666, 2.3722));
        when(journeyRepository.findWithSegmentsById(journeyId)).thenReturn(Optional.of(journey));
        when(tourismSuggestionService.findTopRatedRestaurantsNearby(any(NearbyRestaurantSearch.class)))
                .thenReturn(List.of(suggestion("near", 48.8568, 2.3524, 4.5, 20)));

        List<TourismSuggestion> suggestions = service.findAlongJourney(journeyId);

        assertEquals(1, suggestions.size());
        assertEquals("near", suggestions.getFirst().id());
        verify(tourismSuggestionService, atLeastOnce()).findTopRatedRestaurantsNearby(any(NearbyRestaurantSearch.class));
    }

    @Test
    void findAlongLngLatPairs_deduplicatesFiltersAndSorts() {
        when(tourismSuggestionService.findTopRatedRestaurantsNearby(any(NearbyRestaurantSearch.class)))
                .thenReturn(List.of(
                        suggestion("same", 48.8567, 2.3524, 4.1, 100),
                        suggestion("same", 48.8568, 2.3525, 4.9, 3),
                        suggestion("best", 48.8569, 2.3530, 4.8, 120),
                        suggestion("far", 49.5, 3.5, 5.0, 999),
                        suggestion(null, null, null, 4.0, 1)));

        List<TourismSuggestion> suggestions = service.findAlongLngLatPairs(List.of(
                List.of(2.3522, 48.8566),
                List.of(2.3722, 48.8666)));

        assertEquals(2, suggestions.size());
        assertEquals("best", suggestions.getFirst().id());
        assertEquals("same", suggestions.get(1).id());
    }

    @Test
    void findAlongJourney_buildsPolylineFromSegmentPoints() {
        UUID journeyId = UUID.randomUUID();
        Journey journey = new Journey(null, "A", "B", OffsetDateTime.now(), OffsetDateTime.now().plusHours(1));
        JourneySegment segment = new JourneySegment(journey, 0, SegmentType.WALKING);
        JourneyPoint first = new JourneyPoint(segment, 0, JourneyPointType.ORIGIN, "A");
        first.setCoordinates(new GeoPoint(48.8566, 2.3522));
        JourneyPoint duplicate = new JourneyPoint(segment, 1, JourneyPointType.INTERMEDIATE_STOP, "A bis");
        duplicate.setCoordinates(new GeoPoint(48.85660001, 2.35220001));
        JourneyPoint second = new JourneyPoint(segment, 2, JourneyPointType.DESTINATION, "B");
        second.setCoordinates(new GeoPoint(48.8666, 2.3722));
        segment.addPoint(first);
        segment.addPoint(duplicate);
        segment.addPoint(second);
        journey.addSegment(segment);

        when(journeyRepository.findWithSegmentsById(journeyId)).thenReturn(Optional.of(journey));
        when(tourismSuggestionService.findTopRatedRestaurantsNearby(any(NearbyRestaurantSearch.class)))
                .thenReturn(List.of(suggestion("route", 48.86, 2.36, 4.2, 50)));

        List<TourismSuggestion> suggestions = service.findAlongJourney(journeyId);

        assertEquals(1, suggestions.size());
        assertEquals("route", suggestions.getFirst().id());
    }

    private static TourismSuggestion suggestion(
            String id,
            Double latitude,
            Double longitude,
            Double rating,
            Integer reviewCount) {
        return new TourismSuggestion(
                id,
                id == null ? "No coordinates" : id,
                "Restaurant",
                null,
                "desc",
                rating,
                reviewCount,
                "$$",
                null,
                null,
                null,
                latitude,
                longitude,
                "test",
                List.of());
    }
}
