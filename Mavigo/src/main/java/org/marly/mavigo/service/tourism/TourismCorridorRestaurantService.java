package org.marly.mavigo.service.tourism;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.marly.mavigo.models.journey.Journey;
import org.marly.mavigo.models.journey.JourneyPoint;
import org.marly.mavigo.models.journey.JourneySegment;
import org.marly.mavigo.models.shared.GeoPoint;
import org.marly.mavigo.repository.JourneyRepository;
import org.marly.mavigo.service.tourism.RouteCorridorGeometry.JourneyGeomPoint;
import org.marly.mavigo.service.tourism.dto.NearbyRestaurantSearch;
import org.marly.mavigo.service.tourism.dto.TourismSuggestion;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TourismCorridorRestaurantService {

    private static final Logger LOGGER = LoggerFactory.getLogger(TourismCorridorRestaurantService.class);

    private static final double SAMPLE_SPACING_METERS = 900;
    private static final int MAX_SAMPLE_POINTS = 4;
    private static final int NEARBY_SEARCH_RADIUS_METERS = 850;
    private static final int NEARBY_LIMIT_PER_SAMPLE = 8;
    private static final int MAX_RESULTS = 22;
    private static final double[] FILTER_DISTANCE_TIERS_METERS = { 400.0, 950.0, 2800.0 };

    private final JourneyRepository journeyRepository;
    private final TourismSuggestionService tourismSuggestionService;

    public TourismCorridorRestaurantService(
            JourneyRepository journeyRepository,
            TourismSuggestionService tourismSuggestionService) {
        this.journeyRepository = journeyRepository;
        this.tourismSuggestionService = tourismSuggestionService;
    }

    @Transactional(readOnly = true)
    public List<TourismSuggestion> findAlongJourney(UUID journeyId) {
        Optional<Journey> opt = journeyRepository.findWithSegmentsById(journeyId);
        if (opt.isEmpty()) {
            return List.of();
        }
        Journey journey = opt.get();
        List<double[]> polyline = buildPolylineFromJourney(journey);
        if (polyline.size() < 2 && journey.getOriginCoordinate() != null
                && journey.getOriginCoordinate().isComplete()
                && journey.getDestinationCoordinate() != null
                && journey.getDestinationCoordinate().isComplete()) {
            GeoPoint o = journey.getOriginCoordinate();
            GeoPoint d = journey.getDestinationCoordinate();
            polyline = List.of(
                    new double[] { o.getLongitude(), o.getLatitude() },
                    new double[] { d.getLongitude(), d.getLatitude() });
        }
        if (polyline.size() < 2) {
            LOGGER.debug("Tourism corridor: insufficient geometry for journey {}", journeyId);
            return List.of();
        }
        return findAlongPolyline(polyline);
    }

    public List<TourismSuggestion> findAlongLngLatPairs(List<List<Double>> coordinates) {
        List<double[]> line = parseCorridorCoordinates(coordinates);
        if (line.size() < 2) {
            return List.of();
        }
        return findAlongPolyline(line);
    }

    private List<TourismSuggestion> findAlongPolyline(List<double[]> lineLngLat) {
        List<double[]> centers = RouteCorridorGeometry.sampleCentersAlongLine(
                lineLngLat,
                SAMPLE_SPACING_METERS,
                MAX_SAMPLE_POINTS);

        List<TourismSuggestion> combined = centers.parallelStream()
                .flatMap(c -> {
                    NearbyRestaurantSearch search = new NearbyRestaurantSearch(
                            c[1],
                            c[0],
                            NEARBY_SEARCH_RADIUS_METERS,
                            NEARBY_LIMIT_PER_SAMPLE);
                    List<TourismSuggestion> slice = tourismSuggestionService.findTopRatedRestaurantsNearby(search);
                    return slice == null ? List.<TourismSuggestion>of().stream() : slice.stream();
                })
                .toList();

        combined = dedupePreserveOrder(combined);
        combined = tieredDistanceFilter(combined, lineLngLat);

        combined.sort(
                Comparator
                        .comparing(TourismSuggestion::rating, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(TourismSuggestion::reviewCount, Comparator.nullsLast(Comparator.reverseOrder())));

        if (combined.size() > MAX_RESULTS) {
            return List.copyOf(combined.subList(0, MAX_RESULTS));
        }
        return combined;
    }

    /** Si tout est filtré (ex. données curated loin du tracé), on élargit puis on borne. */
    private List<TourismSuggestion> tieredDistanceFilter(List<TourismSuggestion> merged, List<double[]> corridor) {
        List<TourismSuggestion> withCoordinates = merged.stream()
                .filter(TourismCorridorRestaurantService::hasSuggestionCoordinates)
                .toList();
        if (withCoordinates.isEmpty()) {
            return merged.stream().limit(MAX_RESULTS).toList();
        }
        List<TourismSuggestion> last = List.of();
        for (double tierMeters : FILTER_DISTANCE_TIERS_METERS) {
            List<TourismSuggestion> round = filterWithinMeters(corridor, withCoordinates, tierMeters);
            if (!round.isEmpty()) {
                last = round;
                break;
            }
        }
        if (last.isEmpty()) {
            return withCoordinates.stream().limit(MAX_RESULTS).toList();
        }
        return last;
    }

    private static List<TourismSuggestion> filterWithinMeters(
            List<double[]> corridor,
            List<TourismSuggestion> merged,
            double maxMeters) {
        List<TourismSuggestion> out = new ArrayList<>();
        for (TourismSuggestion s : merged) {
            double lng = Objects.requireNonNull(s.longitude(), "longitude");
            double lat = Objects.requireNonNull(s.latitude(), "latitude");
            if (RouteCorridorGeometry.distancePointToPolylineMeters(lng, lat, corridor) <= maxMeters) {
                out.add(s);
            }
        }
        return out;
    }

    private static boolean hasSuggestionCoordinates(TourismSuggestion s) {
        return s != null && s.latitude() != null && s.longitude() != null
                && !(s.latitude().isNaN() || s.longitude().isNaN());
    }

    private static String stableKey(TourismSuggestion s) {
        if (s.id() != null && !s.id().isBlank()) {
            return s.id().trim();
        }
        return String.format(
                Locale.ROOT,
                "%s|%.5f|%.5f",
                s.name().toLowerCase(Locale.ROOT).trim(),
                s.latitude() != null ? s.latitude() : 0.0,
                s.longitude() != null ? s.longitude() : 0.0);
    }

    private List<TourismSuggestion> dedupePreserveOrder(List<TourismSuggestion> merged) {
        Map<String, TourismSuggestion> byKey = new LinkedHashMap<>();
        for (TourismSuggestion s : merged) {
            if (!hasSuggestionCoordinates(s)) {
                continue;
            }
            byKey.putIfAbsent(stableKey(s), s);
        }
        return new ArrayList<>(byKey.values());
    }

    private List<double[]> buildPolylineFromJourney(Journey journey) {
        List<JourneyGeomPoint> orderedGeom = new ArrayList<>();
        for (JourneySegment segment : journey.getSegments()) {
            for (JourneyPoint point : segment.getPoints()) {
                GeoPoint coords = point.getCoordinates();
                if (coords != null && coords.isComplete()) {
                    orderedGeom.add(new JourneyGeomPoint(coords.getLongitude(), coords.getLatitude()));
                }
            }
        }
        return RouteCorridorGeometry.lineFromOrderedPoints(orderedGeom);
    }

    private List<double[]> parseCorridorCoordinates(List<List<Double>> pairs) {
        if (pairs == null || pairs.isEmpty()) {
            return List.of();
        }
        List<double[]> parsed = new ArrayList<>();
        for (List<Double> pair : pairs) {
            if (pair == null || pair.size() < 2 || pair.get(0) == null || pair.get(1) == null) {
                continue;
            }
            double lng = pair.get(0);
            double lat = pair.get(1);
            if (Math.abs(lat) <= 90.0 && Math.abs(lng) <= 180.0) {
                parsed.add(new double[] { lng, lat });
            }
        }
        return parsed;
    }
}
