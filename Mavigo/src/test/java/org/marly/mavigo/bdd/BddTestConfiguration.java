package org.marly.mavigo.bdd;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.marly.mavigo.client.prim.PrimApiClient;
import org.marly.mavigo.client.prim.dto.PrimJourneyPlanDto;
import org.marly.mavigo.client.prim.model.PrimCoordinates;
import org.marly.mavigo.client.prim.model.PrimJourneyRequest;
import org.marly.mavigo.client.prim.model.PrimPlace;
import org.marly.mavigo.client.prim.model.PrimStopArea;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;

@TestConfiguration
@Profile("test")
public class BddTestConfiguration {

    private static final Map<String, StationData> STATIONS = new HashMap<>();

    static {
        // Paris metro stations for BDD tests
        STATIONS.put("gare de lyon", new StationData(
                "stop_area:IDFM:71264", "Gare de Lyon", 48.8443, 2.3730));
        STATIONS.put("châtelet", new StationData(
                "stop_area:IDFM:71346", "Châtelet", 48.8584, 2.3470));
        STATIONS.put("chatelet", new StationData(
                "stop_area:IDFM:71346", "Châtelet", 48.8584, 2.3470));
        STATIONS.put("nation", new StationData(
                "stop_area:IDFM:71801", "Nation", 48.8483, 2.3952));
        STATIONS.put("la défense", new StationData(
                "stop_area:IDFM:71517", "La Défense", 48.8918, 2.2378));
        STATIONS.put("la defense", new StationData(
                "stop_area:IDFM:71517", "La Défense", 48.8918, 2.2378));
        STATIONS.put("gare du nord", new StationData(
                "stop_area:IDFM:71410", "Gare du Nord", 48.8809, 2.3553));
        STATIONS.put("aéroport cdg", new StationData(
                "stop_area:IDFM:73626", "Aéroport Charles de Gaulle", 49.0097, 2.5479));
        STATIONS.put("aeroport cdg", new StationData(
                "stop_area:IDFM:73626", "Aéroport Charles de Gaulle", 49.0097, 2.5479));
    }

    @Bean
    @Primary
    public PrimApiClient mockPrimApiClient() {
        return new PrimApiClient() {
            @Override
            public List<PrimPlace> searchPlaces(String query) {
                if (query == null || query.isBlank()) {
                    return List.of();
                }

                String normalizedQuery = query.toLowerCase().trim();
                StationData station = STATIONS.get(normalizedQuery);

                if (station != null) {
                    return List.of(createPrimPlace(station));
                }

                // Try partial matching
                for (Map.Entry<String, StationData> entry : STATIONS.entrySet()) {
                    if (entry.getKey().contains(normalizedQuery)
                            || normalizedQuery.contains(entry.getKey())) {
                        return List.of(createPrimPlace(entry.getValue()));
                    }
                }

                return List.of();
            }

            @Override
            public List<PrimPlace> searchPlacesNearby(double latitude, double longitude, int radiusMeters) {
                return searchPlacesNearby(latitude, longitude, radiusMeters, null);
            }

            @Override
            public List<PrimPlace> searchPlacesNearby(double latitude, double longitude, int radiusMeters,
                    String cityName) {
                // Return stations within approximate radius
                List<PrimPlace> results = new ArrayList<>();
                for (StationData station : STATIONS.values()) {
                    double distance = calculateDistance(latitude, longitude, station.lat, station.lon);
                    if (distance <= radiusMeters) {
                        results.add(createPrimPlace(station));
                    }
                }
                return results;
            }

            private StationData findStationByStopAreaId(String stopAreaId) {
                if (stopAreaId == null) {
                    return null;
                }
                for (StationData station : STATIONS.values()) {
                    if (station.id.equals(stopAreaId)) {
                        return station;
                    }
                }
                return null;
            }

            private int estimateJourneyDurationSeconds(PrimJourneyRequest request) {
                StationData from = findStationByStopAreaId(request.getFromStopAreaId());
                StationData to = findStationByStopAreaId(request.getToStopAreaId());
                if (from == null || to == null) {
                    return 8 * 3600;
                }
                double meters = calculateDistance(from.lat, from.lon, to.lat, to.lon);
                int seconds = (int) Math.max(240, Math.round(meters / 7.0));
                return Math.min(seconds, 8 * 3600);
            }

            @Override
            public List<PrimJourneyPlanDto> calculateJourneyPlans(PrimJourneyRequest request) {
                int durationSeconds = estimateJourneyDurationSeconds(request);
                OffsetDateTime now = OffsetDateTime.now();
                OffsetDateTime arrival = now.plusSeconds(durationSeconds);

                StationData from = findStationByStopAreaId(request.getFromStopAreaId());
                StationData to = findStationByStopAreaId(request.getToStopAreaId());
                double originLat = from != null ? from.lat : 48.8566;
                double originLon = from != null ? from.lon : 2.3522;
                double destLat = to != null ? to.lat : originLat;
                double destLon = to != null ? to.lon : originLon;

                PrimJourneyPlanDto.LegDto leg = new PrimJourneyPlanDto.LegDto(
                        1,
                        "section-1",
                        "public_transport",
                        "Metro",
                        "M1",
                        "Ligne 1",
                        "FFCD00",
                        "RATP",
                        now,
                        arrival,
                        durationSeconds,
                        request.getFromStopAreaId(),
                        "Origin",
                        originLat,
                        originLon,
                        request.getToStopAreaId(),
                        "Destination",
                        destLat,
                        destLon,
                        null,
                        true,
                        List.of());

                PrimJourneyPlanDto journeyPlan = new PrimJourneyPlanDto(
                        "journey-test-1",
                        now,
                        arrival,
                        durationSeconds,
                        0,
                        List.of(leg));

                return List.of(journeyPlan);
            }

            private PrimPlace createPrimPlace(StationData station) {
                PrimCoordinates coords = new PrimCoordinates(station.lat, station.lon);
                PrimStopArea stopArea = new PrimStopArea(station.id, station.name, coords);
                return new PrimPlace(station.id, station.name, "stop_area", stopArea, null, coords);
            }

            private double calculateDistance(double lat1, double lon1, double lat2, double lon2) {
                // Haversine formula for approximate distance in meters
                double R = 6371000; // Earth's radius in meters
                double dLat = Math.toRadians(lat2 - lat1);
                double dLon = Math.toRadians(lon2 - lon1);
                double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                        Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                                Math.sin(dLon / 2) * Math.sin(dLon / 2);
                double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            }
        };
    }

    private record StationData(String id, String name, double lat, double lon) {
    }
}
