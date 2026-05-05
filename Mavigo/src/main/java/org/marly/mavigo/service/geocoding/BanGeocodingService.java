package org.marly.mavigo.service.geocoding;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.marly.mavigo.models.shared.GeoPoint;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Service
@Primary
public class BanGeocodingService implements GeocodingService {

    private static final Logger LOGGER = LoggerFactory.getLogger(BanGeocodingService.class);

    private final RestTemplate restTemplate;
    private final String baseUrl;

    public BanGeocodingService(
            RestTemplate restTemplate,
            @Value("${geocoding.ban.base-url:https://api-adresse.data.gouv.fr}") String baseUrl) {
        this.restTemplate = restTemplate;
        this.baseUrl = baseUrl;
    }

    @Override
    public GeoPoint geocode(String address) {
        if (address == null || address.isBlank()) {
            return null;
        }

        GeoPoint coordinateQuery = parseCoordinateQuery(address);
        if (coordinateQuery != null) {
            return coordinateQuery;
        }

        try {
            String encoded = URLEncoder.encode(address, StandardCharsets.UTF_8);
            String url = baseUrl + "/search/?q=" + encoded + "&limit=5&autocomplete=0";

            BanResponse response = restTemplate.getForObject(url, BanResponse.class);
            if (response == null || response.features == null || response.features.isEmpty()) {
                LOGGER.debug("BAN: no geocoding results for '{}'", address);
                return null;
            }

            String cityHint = extractCityHint(address);
            BanFeature chosen = chooseBestFeature(response.features, cityHint);
            if (chosen == null || chosen.geometry == null || chosen.geometry.coordinates == null
                    || chosen.geometry.coordinates.size() < 2) {
                LOGGER.debug("BAN: invalid geometry for '{}'", address);
                return null;
            }

            double lon = chosen.geometry.coordinates.get(0);
            double lat = chosen.geometry.coordinates.get(1);
            LOGGER.info("BAN geocoded '{}' to coordinates: {}, {} (label='{}', city='{}')",
                    address, lat, lon,
                    chosen.properties != null ? chosen.properties.label : null,
                    chosen.properties != null ? chosen.properties.city : null);
            return new GeoPoint(lat, lon);
        } catch (RestClientException e) {
            LOGGER.warn("BAN geocoding failed for '{}': {}", address, e.getMessage());
            return null;
        } catch (Exception e) {
            LOGGER.error("Unexpected BAN error while geocoding '{}'", address, e);
            return null;
        }
    }

    private GeoPoint parseCoordinateQuery(String query) {
        String trimmed = query.trim();
        String separator = trimmed.contains(";") ? ";" : trimmed.contains(",") ? "," : null;
        if (separator == null) {
            return null;
        }

        String[] parts = trimmed.split(separator);
        if (parts.length != 2) {
            return null;
        }

        try {
            double first = Double.parseDouble(parts[0].trim());
            double second = Double.parseDouble(parts[1].trim());

            double latitude = ",".equals(separator) ? first : second;
            double longitude = ",".equals(separator) ? second : first;
            if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
                return null;
            }

            LOGGER.info("Using coordinate query '{}' as {}, {}", query, latitude, longitude);
            return new GeoPoint(latitude, longitude);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @Override
    public String reverseGeocode(GeoPoint point) {
        if (point == null || !point.isComplete()) {
            return null;
        }

        try {
            String url = baseUrl + "/reverse/?lat=" + point.getLatitude()
                    + "&lon=" + point.getLongitude()
                    + "&limit=1";

            BanResponse response = restTemplate.getForObject(url, BanResponse.class);
            if (response == null || response.features == null || response.features.isEmpty()) {
                return null;
            }

            BanFeature feature = response.features.get(0);
            if (feature == null || feature.properties == null) {
                return null;
            }

            String label = feature.properties.label;
            if (label == null || label.isBlank()) {
                return null;
            }
            return label.trim();
        } catch (RestClientException e) {
            LOGGER.warn("BAN reverse geocoding failed for {}, {}: {}",
                    point.getLatitude(), point.getLongitude(), e.getMessage());
            return null;
        } catch (Exception e) {
            LOGGER.error("Unexpected BAN error while reverse geocoding", e);
            return null;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class BanResponse {
        @JsonProperty("features")
        List<BanFeature> features;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class BanFeature {
        @JsonProperty("geometry")
        BanGeometry geometry;

        @JsonProperty("properties")
        BanProperties properties;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class BanGeometry {
        @JsonProperty("coordinates")
        List<Double> coordinates;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class BanProperties {
        @JsonProperty("label")
        String label;

        @JsonProperty("city")
        String city;

        @JsonProperty("postcode")
        String postcode;

        @JsonProperty("score")
        Double score;

        @JsonProperty("type")
        String type;
    }

    private String extractCityHint(String address) {
        if (address == null || address.isBlank()) {
            return null;
        }
        String[] parts = address.split(",");
        if (parts.length >= 2) {
            return parts[parts.length - 1].trim();
        }
        return null;
    }

    private BanFeature chooseBestFeature(List<BanFeature> features, String cityHint) {
        if (features == null || features.isEmpty()) {
            return null;
        }

        BanFeature best = null;
        double bestScore = -1;

        for (BanFeature f : features) {
            if (f == null || f.geometry == null || f.geometry.coordinates == null
                    || f.geometry.coordinates.size() < 2) {
                continue;
            }
            double score = f.properties != null && f.properties.score != null
                    ? f.properties.score
                    : 0;

            if (cityHint != null && !cityHint.isBlank()) {
                String city = f.properties != null ? f.properties.city : null;
                String label = f.properties != null ? f.properties.label : null;
                if (city != null && city.toLowerCase().contains(cityHint.toLowerCase())) {
                    if (score > bestScore) {
                        best = f;
                        bestScore = score;
                    }
                    continue;
                }
                if (label != null && label.toLowerCase().contains(cityHint.toLowerCase())) {
                    if (score > bestScore) {
                        best = f;
                        bestScore = score;
                    }
                    continue;
                }
            }

            if (cityHint == null && score > bestScore) {
                best = f;
                bestScore = score;
            }
        }

        if (best != null) {
            return best;
        }

        // Fallback: highest score regardless of city
        for (BanFeature f : features) {
            if (f == null) continue;
            double score = f.properties != null && f.properties.score != null
                    ? f.properties.score
                    : 0;
            if (score > bestScore) {
                best = f;
                bestScore = score;
            }
        }
        return best;
    }
}
