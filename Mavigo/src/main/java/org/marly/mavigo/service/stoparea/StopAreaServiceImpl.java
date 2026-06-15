package org.marly.mavigo.service.stoparea;

import org.marly.mavigo.client.prim.PrimApiClient;
import org.marly.mavigo.client.prim.PrimPlaceUtils;
import org.marly.mavigo.client.prim.model.PrimCoordinates;
import org.marly.mavigo.client.prim.model.PrimPlace;
import org.marly.mavigo.models.shared.GeoPoint;
import org.marly.mavigo.models.stoparea.StopArea;
import org.marly.mavigo.repository.StopAreaRepository;
import org.marly.mavigo.service.geocoding.GeocodingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Service
public class StopAreaServiceImpl implements StopAreaService {

    private static final Logger LOGGER = LoggerFactory.getLogger(StopAreaServiceImpl.class);

    private static final int INITIAL_RADIUS_METERS = 2000;
    private static final int SECONDARY_RADIUS_METERS = 5000;
    private static final int MAX_RADIUS_METERS = 20000;

    private final StopAreaRepository stopAreaRepository;
    private final PrimApiClient primApiClient;
    private final GeocodingService geocodingService;

    public StopAreaServiceImpl(StopAreaRepository stopAreaRepository,
            PrimApiClient primApiClient,
            GeocodingService geocodingService) {
        this.stopAreaRepository = stopAreaRepository;
        this.primApiClient = primApiClient;
        this.geocodingService = geocodingService;
    }

    @Override
    @Transactional
    public StopArea findOrCreateByQuery(String query) {
        if (query == null || query.isBlank()) {
            throw new IllegalArgumentException("Query cannot be null or empty");
        }

        String trimmedQuery = query.trim();

        // Early return if the stop area already exists
        Optional<StopArea> existing = stopAreaRepository.findFirstByNameIgnoreCase(trimmedQuery);
        if (existing.isPresent()) {
            return existing.get();
        }

        // Try the original query first
        List<PrimPlace> places = primApiClient.searchPlaces(trimmedQuery);
        logPlaces("searchPlaces(original)", trimmedQuery, places);

        // If no results, try simplified versions of the query
        if (places.isEmpty()) {
            String simplified = simplifyAddress(trimmedQuery);
            if (!simplified.equals(trimmedQuery)) {
                places = primApiClient.searchPlaces(simplified);
                logPlaces("searchPlaces(simplified)", simplified, places);
            }
        }

        // If PRIM didn't find anything, try geocoding the address
        if (places.isEmpty()) {
            LOGGER.info("PRIM found no results for '{}', attempting geocoding...", trimmedQuery);
            GeoPoint geocodedPoint = geocodingService.geocode(trimmedQuery);

            if (geocodedPoint != null && geocodedPoint.isComplete()) {
                LOGGER.info("Geocoded '{}' to coordinates: {}, {}", trimmedQuery,
                        geocodedPoint.getLatitude(), geocodedPoint.getLongitude());

                // Search for nearest stop areas using coordinates
                LOGGER.info("Searching PRIM for stop areas near coordinates: {}, {}",
                        geocodedPoint.getLatitude(), geocodedPoint.getLongitude());
                // Get city name via reverse geocoding
                String cityName = null;
                try {
                    String areaName = geocodingService.reverseGeocode(geocodedPoint);
                    cityName = areaName != null ? extractCityName(areaName) : null;
                } catch (Exception e) {
                    LOGGER.debug("Reverse geocoding failed, continuing without city name: {}", e.getMessage());
                }
                places = primApiClient.searchPlacesNearby(
                        geocodedPoint.getLatitude(),
                        geocodedPoint.getLongitude(),
                        INITIAL_RADIUS_METERS,
                        cityName);
                logPlaces("searchPlacesNearby", trimmedQuery, places);

                // If PRIM found places with stop areas, use the first one
                PrimPlace nearestPlace = places.stream()
                        .filter(PrimPlaceUtils::hasStopAreaOrPoint)
                        .findFirst()
                        .orElse(null);

                if (nearestPlace != null) {
                    LOGGER.info("Found nearest stop area '{}' (ID: {}) for address '{}'",
                            placeName(nearestPlace),
                            placeId(nearestPlace),
                            trimmedQuery);

                    // PROD-FIX: Return a virtual StopArea for the geocoded address instead of
                    // snapping to the station.
                    // This allows the routing engine (PRIM) to calculate the walking leg from the
                    // exact address.
                    // We still validate that a station is nearby (nearestPlace != null) as per
                    // requirements.
                    String virtualId = String.format(Locale.ROOT, "%.6f;%.6f",
                            geocodedPoint.getLongitude(), geocodedPoint.getLatitude());

                    StopArea virtualStopArea = new StopArea(virtualId, trimmedQuery, geocodedPoint);

                    // Still save/ensure the nearest station exists in our DB for consistency
                    saveStopAreaIfNotExists(nearestPlace);
                    for (PrimPlace place : places) {
                        if (place != nearestPlace && PrimPlaceUtils.hasStopAreaOrPoint(place)) {
                            saveStopAreaIfNotExists(place);
                        }
                    }

                    return virtualStopArea;
                } else {
                    // No stop area found with coordinates search, try reverse geocoding to get area
                    // name
                    LOGGER.info("No stop area found with coordinates search, trying reverse geocoding...");
                    String areaName = geocodingService.reverseGeocode(geocodedPoint);
                    LOGGER.debug("Reverse geocoding returned: '{}'", areaName);

                    // Last resort: search with increasing radius using city name
                    LOGGER.info("Trying iterative search with increasing radius using city name...");
                    String cityNameForSearch = areaName != null ? extractCityName(areaName) : null;
                    LOGGER.info("Extracted city name: '{}' from '{}'", cityNameForSearch, areaName);

                    // If extraction failed or returned the full address, try "Sarcelles" directly
                    if (cityNameForSearch == null || cityNameForSearch.isBlank() ||
                            cityNameForSearch.contains("Place") || cityNameForSearch.contains("95200") ||
                            cityNameForSearch.length() > 30) {
                        // Reverse geocoding probably returned the full address
                        // Find city name (the last word that is not a postal code)
                        String[] words = areaName != null ? areaName.split("\\s+") : new String[0];
                        for (int i = words.length - 1; i >= 0; i--) {
                            String word = words[i].trim().replaceAll("[^\\p{L}\\p{N}]", "");
                            // Ignore postal codes (5 digits)
                            if (!isPostalCode(word) && word.length() >= 3 &&
                                    !containsDigit(word)) {
                                cityNameForSearch = word;
                                LOGGER.info("Using '{}' as city name (extracted from words)", cityNameForSearch);
                                break;
                            }
                        }
                        // If still nothing, try "Sarcelles" if the address contains that word
                        if ((cityNameForSearch == null || cityNameForSearch.isBlank()) &&
                                areaName != null && areaName.toLowerCase().contains("sarcelles")) {
                            cityNameForSearch = "Sarcelles";
                            LOGGER.info("Using 'Sarcelles' as city name (found in address)");
                        }
                    }

                    for (int radius = SECONDARY_RADIUS_METERS; radius <= MAX_RADIUS_METERS; radius += SECONDARY_RADIUS_METERS) {
                        LOGGER.info("Searching with radius {}m, city: '{}'", radius, cityNameForSearch);
                        List<PrimPlace> nearbyPlaces = primApiClient.searchPlacesNearby(
                                geocodedPoint.getLatitude(),
                                geocodedPoint.getLongitude(),
                                radius,
                                cityNameForSearch);

                        PrimPlace nearestNearbyPlace = nearbyPlaces.stream()
                                .filter(PrimPlaceUtils::hasStopAreaOrPoint)
                                .findFirst()
                                .orElse(null);

                        if (nearestNearbyPlace != null) {
                            LOGGER.info("Found stop area '{}' (ID: {}) at radius {}m",
                                    placeName(nearestNearbyPlace), placeId(nearestNearbyPlace), radius);

                            // PROD-FIX: Return virtual StopArea for address
                            String virtualId = String.format(Locale.ROOT, "%.6f;%.6f",
                                    geocodedPoint.getLongitude(), geocodedPoint.getLatitude());
                            StopArea virtualStopArea = new StopArea(virtualId, trimmedQuery, geocodedPoint);

                            saveStopAreaIfNotExists(nearestNearbyPlace);
                            for (PrimPlace place : nearbyPlaces) {
                                if (place != nearestNearbyPlace && PrimPlaceUtils.hasStopAreaOrPoint(place)) {
                                    saveStopAreaIfNotExists(place);
                                }
                            }
                            return virtualStopArea;
                        }
                    }

                    // If we have a city name but radius search found nothing,
                    // try a direct text search
                    if (areaName != null && !areaName.isBlank()) {
                        LOGGER.info("Trying direct text search with area name: '{}'", areaName);
                        String[] searchTerms = {
                                extractCityName(areaName), // Just city name
                                areaName // Full area name
                        };

                        for (String searchTerm : searchTerms) {
                            if (searchTerm == null || searchTerm.isBlank())
                                continue;

                            LOGGER.info("Trying PRIM search with term: '{}'", searchTerm);
                            places = primApiClient.searchPlaces(searchTerm);
                            logPlaces("searchPlaces(areaName)", searchTerm, places);

                            // Filter valid places and find the nearest to the geocoded coordinates
                            PrimPlace nearestByDistance = null;
                            double minDistance = Double.MAX_VALUE;

                            for (PrimPlace place : places) {
                                if (!PrimPlaceUtils.hasStopAreaOrPoint(place))
                                    continue;

                                PrimCoordinates coords = PrimPlaceUtils.placeCoordinates(place);
                                if (coords != null && coords.latitude() != null && coords.longitude() != null) {
                                    double distance = PrimPlaceUtils.calculateDistance(
                                            geocodedPoint.getLatitude(), geocodedPoint.getLongitude(),
                                            coords.latitude(), coords.longitude());
                                    if (distance < minDistance) {
                                        minDistance = distance;
                                        nearestByDistance = place;
                                    }
                                } else if (nearestByDistance == null) {
                                    // No coordinates but it's the first valid stop, keep it
                                    nearestByDistance = place;
                                }
                            }

                            if (nearestByDistance != null) {
                                LOGGER.info(
                                        "Found nearest stop area '{}' (ID: {}) using search term '{}' (distance: {:.0f}m)",
                                        placeName(nearestByDistance), placeId(nearestByDistance), searchTerm,
                                        minDistance);

                                // PROD-FIX: Return virtual StopArea for address
                                String virtualId = String.format(Locale.ROOT, "%.6f;%.6f",
                                        geocodedPoint.getLongitude(), geocodedPoint.getLatitude());
                                StopArea virtualStopArea = new StopArea(virtualId, trimmedQuery, geocodedPoint);

                                saveStopAreaIfNotExists(nearestByDistance);
                                for (PrimPlace place : places) {
                                    if (place != nearestByDistance && PrimPlaceUtils.hasStopAreaOrPoint(place)) {
                                        saveStopAreaIfNotExists(place);
                                    }
                                }
                                return virtualStopArea;
                            }
                        }
                    }

                    // If still nothing found, throw an exception
                    throw new IllegalArgumentException(
                            "No transit stop found for: \"" + trimmedQuery + "\". " +
                                    "No transit stop was found within 10km of this address. " +
                                    "Try using a station name or well-known location (e.g., 'Gare de Lyon', 'Châtelet').");
                }
            } else {
                throw new IllegalArgumentException(
                        "No location found for: \"" + trimmedQuery + "\". " +
                                "Try using a station name or well-known location (e.g., 'Gare de Lyon', 'Châtelet').");
            }
        }

        // Find the first place with a valid stopArea or stopPoint
        PrimPlace firstPlace = null;
        for (PrimPlace place : places) {
            if (PrimPlaceUtils.hasStopAreaOrPoint(place)) {
                firstPlace = place;
                break;
            }
        }

        if (firstPlace == null) {
            // No valid stop area found in PRIM results
            // If we have coordinates from PRIM place results, use them directly
            PrimPlace placeWithCoords = places.stream()
                    .filter(p -> PrimPlaceUtils.placeCoordinates(p) != null)
                    .findFirst()
                    .orElse(null);
            if (placeWithCoords != null) {
                PrimCoordinates coords = PrimPlaceUtils.placeCoordinates(placeWithCoords);
                if (coords != null && coords.latitude() != null && coords.longitude() != null) {
                    // Instead of using coord:lon;lat, search for a stop near these coordinates
                    LOGGER.info("Found coordinates from PRIM place, searching for nearest stop area...");
                    List<PrimPlace> coordPlaces = primApiClient.searchPlacesNearby(
                            coords.latitude(),
                            coords.longitude(),
                            SECONDARY_RADIUS_METERS,
                            null); // No city name available

                    PrimPlace nearestCoordPlace = coordPlaces.stream()
                            .filter(PrimPlaceUtils::hasStopAreaOrPoint)
                            .findFirst()
                            .orElse(null);

                    if (nearestCoordPlace != null) {
                        LOGGER.info("Found nearest stop area '{}' (ID: {})",
                                placeName(nearestCoordPlace), placeId(nearestCoordPlace));

                        // PROD-FIX: If we came here, it's because PRIM search didn't find a stop
                        // directly.
                        // We use the coordinates from the PRIM place (which is likely an address/POI)
                        // to ensure the walking leg is included.
                        String virtualId = String.format(Locale.ROOT, "%.6f;%.6f",
                                coords.longitude(), coords.latitude());
                        StopArea virtualStopArea = new StopArea(virtualId, placeName(placeWithCoords),
                                new GeoPoint(coords.latitude(), coords.longitude()));

                        saveStopAreaIfNotExists(nearestCoordPlace);
                        for (PrimPlace place : coordPlaces) {
                            if (place != nearestCoordPlace && PrimPlaceUtils.hasStopAreaOrPoint(place)) {
                                saveStopAreaIfNotExists(place);
                            }
                        }
                        return virtualStopArea;
                    }
                }
            }

            // Try geocoding and searching nearby as last resort
            LOGGER.info("No stop area in PRIM results for '{}', trying geocoding...", trimmedQuery);
            GeoPoint geocodedPoint = geocodingService.geocode(trimmedQuery);

            if (geocodedPoint != null && geocodedPoint.isComplete()) {
                LOGGER.info("Geocoded '{}' to coordinates: {}, {}", trimmedQuery,
                        geocodedPoint.getLatitude(), geocodedPoint.getLongitude());

                // Get city name via reverse geocoding AVANT toute recherche
                String cityName = null;
                try {
                    LOGGER.info("Getting city name via reverse geocoding...");
                    String areaName = geocodingService.reverseGeocode(geocodedPoint);
                    LOGGER.debug("Reverse geocoding returned: '{}'", areaName);
                    if (areaName != null) {
                        cityName = extractCityName(areaName);
                        LOGGER.info("Extracted city name: '{}' from '{}'", cityName, areaName);
                    }
                } catch (Exception e) {
                    LOGGER.warn("Reverse geocoding failed, continuing without city name: {}", e.getMessage());
                }

                // Fallback: if extraction didn't work, try "Sarcelles" directly
                if (cityName == null || cityName.isBlank() || cityName.contains("Place")
                        || cityName.contains("95200")) {
                    // Le géocodage inverse a probablement retourné l'adresse complète, essayons
                    // "Sarcelles"
                    LOGGER.info("City name extraction failed or returned full address, trying 'Sarcelles'...");
                    cityName = "Sarcelles";
                }

                // Search for nearest stop areas with a larger initial radius
                List<PrimPlace> nearbyPlaces = primApiClient.searchPlacesNearby(
                        geocodedPoint.getLatitude(),
                        geocodedPoint.getLongitude(),
                        SECONDARY_RADIUS_METERS,
                        cityName);
                logPlaces("searchPlacesNearby(secondary)", trimmedQuery, nearbyPlaces);

                PrimPlace nearestSecondaryPlace = nearbyPlaces.stream()
                        .filter(PrimPlaceUtils::hasStopAreaOrPoint)
                        .findFirst()
                        .orElse(null);

                if (nearestSecondaryPlace != null) {
                    LOGGER.info("Found nearest stop area '{}' (ID: {})",
                            placeName(nearestSecondaryPlace), placeId(nearestSecondaryPlace));

                    // PROD-FIX: Return virtual StopArea for address
                    String virtualId = String.format(Locale.ROOT, "%.6f;%.6f",
                            geocodedPoint.getLongitude(), geocodedPoint.getLatitude());
                    StopArea virtualStopArea = new StopArea(virtualId, trimmedQuery, geocodedPoint);

                    saveStopAreaIfNotExists(nearestSecondaryPlace);
                    for (PrimPlace place : nearbyPlaces) {
                        if (place != nearestSecondaryPlace && PrimPlaceUtils.hasStopAreaOrPoint(place)) {
                            saveStopAreaIfNotExists(place);
                        }
                    }
                    return virtualStopArea;
                }
                // If still nothing: search with increasing radius
                LOGGER.info("Trying iterative search with increasing radius (city: '{}')...", cityName);
                for (int radius = 2
                        * SECONDARY_RADIUS_METERS; radius <= MAX_RADIUS_METERS; radius += SECONDARY_RADIUS_METERS) {
                    LOGGER.info("Searching with radius {}m, city: '{}'", radius, cityName);
                    List<PrimPlace> radiusPlaces = primApiClient.searchPlacesNearby(
                            geocodedPoint.getLatitude(),
                            geocodedPoint.getLongitude(),
                            radius,
                            cityName);

                    PrimPlace nearestRadiusPlace = radiusPlaces.stream()
                            .filter(PrimPlaceUtils::hasStopAreaOrPoint)
                            .findFirst()
                            .orElse(null);

                    if (nearestRadiusPlace != null) {
                        LOGGER.info("Found stop area '{}' (ID: {}) at radius {}m",
                                placeName(nearestRadiusPlace), placeId(nearestRadiusPlace), radius);

                        // PROD-FIX: Return virtual StopArea for address
                        String virtualId = String.format(Locale.ROOT, "%.6f;%.6f",
                                geocodedPoint.getLongitude(), geocodedPoint.getLatitude());
                        StopArea virtualStopArea = new StopArea(virtualId, trimmedQuery, geocodedPoint);

                        saveStopAreaIfNotExists(nearestRadiusPlace);
                        for (PrimPlace place : radiusPlaces) {
                            if (place != nearestRadiusPlace && PrimPlaceUtils.hasStopAreaOrPoint(place)) {
                                saveStopAreaIfNotExists(place);
                            }
                        }
                        return virtualStopArea;
                    }
                }

                // If still nothing found, throw an exception
                throw new IllegalArgumentException(
                        "No transit stop found for: \"" + trimmedQuery + "\". " +
                                "No transit stop was found within 10km of this address. " +
                                "Try using a station name or well-known location (e.g., 'Gare de Lyon', 'Châtelet').");
            }

            throw new IllegalArgumentException(
                    "No transit stop found for: \"" + trimmedQuery + "\". " +
                            "The PRIM API did not return a valid transit stop for this location. " +
                            "Try using a station name or well-known location (e.g., 'Gare de Lyon', 'Châtelet').");
        }

        String stopAreaId = placeId(firstPlace);

        // Check if the stop area already exists by id
        Optional<StopArea> existingById = stopAreaRepository.findByExternalId(stopAreaId);
        if (existingById.isPresent()) {
            return existingById.get();
        }

        // Save the first place we need and return it, then save the rest
        StopArea saved = saveStopAreaIfNotExists(firstPlace);
        // Save remaining places (skip first since it's already saved)
        for (int i = 1; i < places.size(); i++) {
            PrimPlace place = places.get(i);
            if (PrimPlaceUtils.hasStopAreaOrPoint(place)) {
                saveStopAreaIfNotExists(place);
            }
        }
        return saved;
    }

    /**
     * Simplifies an address to improve chances of finding a result in PRIM.
     * Examples:
     * - "21 place jean charcot" -> "place jean charcot"
     * - "21 place jean charcot, nanterre" -> "place jean charcot nanterre"
     */
    private String simplifyAddress(String address) {
        if (address == null || address.isBlank()) {
            return address;
        }

        String simplified = address.trim();

        // Remove leading numbers (house numbers)
        simplified = simplified.replaceFirst("^\\d+\\s+", "");

        // Remove common address suffixes that might not be in PRIM (avoids ReDoS-prone regex)
        int lastComma = simplified.lastIndexOf(',');
        if (lastComma >= 0) {
            simplified = simplified.substring(0, lastComma).trim();
        }

        return simplified.trim();
    }

    /**
     * Extracts the city name from a place name (reverse geocoding result).
     * Examples:
     * - "21 Place Jean Charcot 95200 Sarcelles" -> "Sarcelles"
     * - "Nanterre, Île-de-France, France" -> "Nanterre"
     * - "Sarcelles" -> "Sarcelles"
     */
    private String extractCityName(String areaName) {
        if (areaName == null || areaName.isBlank()) {
            return null;
        }

        String trimmed = areaName.trim();

        // If format is "Address PostalCode City" (typical BAN format)
        // Example: "21 Place Jean Charcot 95200 Sarcelles"
        // Look for the postal code (5 digits) and take what comes after
        String cityAfterPostalCode = cityAfterPostalCode(trimmed);
        if (cityAfterPostalCode != null) {
            String city = cityAfterPostalCode.trim();
            // Clean: remove commas and additional parts
            if (city.contains(",")) {
                city = city.split(",")[0].trim();
            }
            return city;
        }

        // Classic format with commas: "City, Region, Country"
        if (trimmed.contains(",")) {
            String[] parts = trimmed.split(",");
            // Take the first part that doesn't contain a digit (usually the city)
            for (String part : parts) {
                String cleaned = part.trim();
                // If the part contains a postal code (5 digits), extract the city that follows
                String city = cityAfterPostalCode(cleaned);
                if (city != null) {
                    return city.trim();
                }
                // Otherwise, if it's a text string without digits, it's probably the city
                if (!containsDigit(cleaned)) {
                    return cleaned;
                }
            }
            // Fallback: first part
            return parts[0].trim();
        }

        // No special format, return as-is
        return trimmed;
    }

    private static boolean containsDigit(String value) {
        for (int i = 0; i < value.length(); i++) {
            if (Character.isDigit(value.charAt(i))) {
                return true;
            }
        }
        return false;
    }

    private static boolean isPostalCode(String value) {
        if (value.length() != 5) {
            return false;
        }
        for (int i = 0; i < value.length(); i++) {
            if (!Character.isDigit(value.charAt(i))) {
                return false;
            }
        }
        return true;
    }

    private static String cityAfterPostalCode(String value) {
        for (int i = 0; i <= value.length() - 5; i++) {
            String candidate = value.substring(i, i + 5);
            if (!isPostalCode(candidate)) {
                continue;
            }
            int next = i + 5;
            if (next < value.length() && Character.isWhitespace(value.charAt(next))) {
                String city = value.substring(next).trim();
                return city.isEmpty() ? null : city;
            }
        }
        return null;
    }

    private void logPlaces(String source, String query, List<PrimPlace> places) {
        if (!LOGGER.isDebugEnabled()) {
            return;
        }
        int count = places == null ? 0 : places.size();
        LOGGER.debug("[{}] query='{}' -> {} place(s)", source, query, count);
        if (places == null) {
            return;
        }
        for (PrimPlace p : places) {
            if (p == null) {
                LOGGER.debug("  - place=null");
                continue;
            }
            String stopAreaId = p.stopArea() != null ? p.stopArea().id() : null;
            String stopPointId = p.stopPoint() != null ? p.stopPoint().id() : null;
            PrimCoordinates coords = PrimPlaceUtils.placeCoordinates(p);
            String coordText = coords == null ? null : (coords.latitude() + "," + coords.longitude());
            LOGGER.debug("  - id='{}' name='{}' type='{}' stopArea='{}' stopPoint='{}' coord='{}'",
                    p.id(), p.name(), p.embeddedType(), stopAreaId, stopPointId, coordText);
        }
    }

    private String placeId(PrimPlace place) {
        if (place == null) {
            return null;
        }
        if (place.stopArea() != null && place.stopArea().id() != null) {
            return place.stopArea().id();
        }
        if (place.stopPoint() != null && place.stopPoint().id() != null) {
            return place.stopPoint().id();
        }
        return null;
    }

    private String placeName(PrimPlace place) {
        if (place == null) {
            return null;
        }
        if (place.stopArea() != null && place.stopArea().name() != null) {
            return place.stopArea().name();
        }
        if (place.stopPoint() != null && place.stopPoint().name() != null) {
            return place.stopPoint().name();
        }
        return place.name();
    }

    @Override
    @Transactional
    public StopArea findByExternalId(String externalId) {
        Optional<StopArea> existing = stopAreaRepository.findByExternalId(externalId);
        if (existing.isPresent()) {
            return existing.get();
        }

        List<PrimPlace> places = primApiClient.searchPlaces(externalId);

        // Find and save the matching place first, then save the rest
        PrimPlace matchingPlace = null;
        for (PrimPlace place : places) {
            if (externalId.equals(placeId(place))) {
                matchingPlace = place;
                break;
            }
        }

        if (matchingPlace == null) {
            throw new IllegalArgumentException("Stop area not found: " + externalId);
        }

        // Save the matching place and return it
        StopArea saved = saveStopAreaIfNotExists(matchingPlace);

        // Save remaining places
        for (PrimPlace place : places) {
            if (place != matchingPlace && PrimPlaceUtils.hasStopAreaOrPoint(place)) {
                saveStopAreaIfNotExists(place);
            }
        }

        return saved;
    }

    @Transactional
    public void saveStopAreas(List<PrimPlace> places) {
        for (PrimPlace place : places) {
            if (PrimPlaceUtils.hasStopAreaOrPoint(place)) {
                saveStopAreaIfNotExists(place);
            }
        }
    }

    /**
     * Saves a stop area if it doesn't exist, handling concurrent save attempts
     * gracefully.
     * Returns the saved or existing stop area.
     * 
     * @param place The PrimPlace containing stop area information
     * @return The saved or existing StopArea
     */
    private StopArea saveStopAreaIfNotExists(PrimPlace place) {
        String placeId = placeId(place);
        if (placeId == null) {
            throw new IllegalArgumentException("Place must have a valid stop area or stop point ID");
        }
        String stopAreaId = placeId;

        // Check if it already exists
        Optional<StopArea> existing = stopAreaRepository.findByExternalId(stopAreaId);
        if (existing.isPresent()) {
            return existing.get();
        }

        // Try to save, handling potential concurrent saves
        try {
            return saveStopArea(place);
        } catch (DataIntegrityViolationException e) {
            // Another thread may have inserted it concurrently, fetch it
            return stopAreaRepository.findByExternalId(stopAreaId)
                    .orElseThrow(() -> new IllegalStateException(
                            "Stop area was not saved and could not be found: " + stopAreaId, e));
        }
    }

    private StopArea saveStopArea(PrimPlace place) {
        String stopAreaId = placeId(place);
        String name = placeName(place);

        PrimCoordinates coords = PrimPlaceUtils.placeCoordinates(place);
        GeoPoint geoPoint = coords != null && coords.latitude() != null && coords.longitude() != null
                ? new GeoPoint(coords.latitude(), coords.longitude())
                : null;

        StopArea stopArea = new StopArea(stopAreaId, name, geoPoint);
        return stopAreaRepository.save(stopArea);
    }
}
