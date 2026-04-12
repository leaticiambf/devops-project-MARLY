package org.marly.mavigo.service.tourism;

import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import org.marly.mavigo.service.tourism.dto.NearbyRestaurantSearch;
import org.marly.mavigo.service.tourism.dto.TourismSuggestion;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@Service
public class DefaultTourismSuggestionService implements TourismSuggestionService {

    private static final Logger LOGGER = LoggerFactory.getLogger(DefaultTourismSuggestionService.class);
    private static final Duration YELP_CONNECT_TIMEOUT = Duration.ofSeconds(5);
    private static final Duration YELP_READ_TIMEOUT = Duration.ofSeconds(30);

    private final RestTemplate restTemplate;
    private final String yelpBaseUrl;
    private final String yelpApiKey;

    public DefaultTourismSuggestionService(
            RestTemplateBuilder restTemplateBuilder,
            @Value("${tourism.yelp.base-url:https://api.yelp.com/v3}") String yelpBaseUrl,
            @Value("${tourism.yelp.api-key:}") String yelpApiKey) {
        this.restTemplate = restTemplateBuilder
                .setConnectTimeout(YELP_CONNECT_TIMEOUT)
                .setReadTimeout(YELP_READ_TIMEOUT)
                .build();
        this.yelpBaseUrl = yelpBaseUrl;
        this.yelpApiKey = yelpApiKey;
    }

    @Override
    public List<TourismSuggestion> findTopRatedRestaurantsNearby(NearbyRestaurantSearch search) {
        if (!hasText(yelpApiKey)) {
            LOGGER.info("Yelp API key is missing, returning curated local recommendations");
            return curatedSuggestions(search);
        }

        URI uri = UriComponentsBuilder.fromHttpUrl(yelpBaseUrl + "/businesses/search")
                .queryParam("latitude", search.latitude())
                .queryParam("longitude", search.longitude())
                .queryParam("categories", "restaurants")
                .queryParam("radius", search.radiusMeters())
                .queryParam("limit", search.limit())
                .queryParam("sort_by", "best_match")
                .build(true)
                .toUri();

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(yelpApiKey);

        try {
            ResponseEntity<YelpSearchResponse> response = restTemplate.exchange(
                    uri,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    YelpSearchResponse.class);

            YelpSearchResponse body = response.getBody();
            if (body == null || body.businesses == null) {
                return List.of();
            }

            return body.businesses.stream()
                    .filter(business -> business != null && hasText(business.id) && hasText(business.name))
                    .map(this::mapYelpSuggestion)
                    .sorted(Comparator
                            .comparing(TourismSuggestion::rating, Comparator.nullsLast(Comparator.reverseOrder()))
                            .thenComparing(TourismSuggestion::reviewCount,
                                    Comparator.nullsLast(Comparator.reverseOrder())))
                    .limit(search.limit())
                    .toList();
        } catch (RestClientException exception) {
            LOGGER.warn("Yelp nearby restaurant search failed: {}. Returning curated local recommendations.",
                    exception.getMessage());
            return curatedSuggestions(search);
        }
    }

    private TourismSuggestion mapYelpSuggestion(YelpBusiness business) {
        List<String> tags = business.categories == null
                ? List.of()
                : business.categories.stream()
                        .map(category -> category.title)
                        .filter(DefaultTourismSuggestionService::hasText)
                        .limit(3)
                        .toList();

        String address = business.location != null && business.location.displayAddress != null
                ? String.join(", ", business.location.displayAddress)
                : null;

        return new TourismSuggestion(
                business.id,
                business.name,
                "Restaurant",
                address,
                buildYelpDescription(business),
                business.rating,
                business.reviewCount,
                business.price,
                business.imageUrl,
                business.url,
                business.phone,
                business.coordinates != null ? business.coordinates.latitude : null,
                business.coordinates != null ? business.coordinates.longitude : null,
                "yelp",
                tags);
    }

    private String buildYelpDescription(YelpBusiness business) {
        List<String> parts = new ArrayList<>();
        if (business.rating != null) {
            parts.add(String.format(Locale.ROOT, "%.1f/5 rating", business.rating));
        }
        if (business.reviewCount != null) {
            parts.add(business.reviewCount + " reviews");
        }
        if (hasText(business.price)) {
            parts.add("price " + business.price);
        }
        return parts.isEmpty() ? "Popular nearby restaurant discovered on Yelp." : String.join(" · ", parts);
    }

    private List<TourismSuggestion> curatedSuggestions(NearbyRestaurantSearch search) {
        List<TourismSuggestion> suggestions = List.of(
                new TourismSuggestion(
                        "mock-le-bon-bivouac",
                        "Le Bon Bivouac",
                        "Restaurant",
                        "12 Rue des Francs Bourgeois, Paris",
                        "Reliable bistro pick with strong reviews and easy metro access.",
                        4.7,
                        128,
                        "$$",
                        null,
                        null,
                        "+33 1 42 00 00 01",
                        48.8572,
                        2.3621,
                        "curated",
                        List.of("Restaurant", "Transit-friendly", "Popular")),
                new TourismSuggestion(
                        "mock-riverside-table",
                        "Riverside Table",
                        "Restaurant",
                        "3 Quai de l'Horloge, Paris",
                        "Scenic riverside option for visitors who want something central and easy to reach.",
                        4.5,
                        94,
                        "$$",
                        null,
                        null,
                        "+33 1 42 00 00 02",
                        48.8551,
                        2.3446,
                        "curated",
                        List.of("Restaurant", "Scenic", "City center")),
                new TourismSuggestion(
                        "mock-hidden-courtyard",
                        "Hidden Courtyard Spot",
                        "Restaurant",
                        "20 Passage des Panoramas, Paris",
                        "Quiet courtyard address with a more tucked-away atmosphere.",
                        4.4,
                        76,
                        "$",
                        null,
                        null,
                        "+33 1 42 00 00 03",
                        48.8711,
                        2.3417,
                        "curated",
                        List.of("Restaurant", "Budget-friendly", "Quiet")));

        return suggestions.stream().limit(search.limit()).toList();
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class YelpSearchResponse {
        @JsonProperty("businesses")
        public List<YelpBusiness> businesses;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class YelpBusiness {
        public String id;
        public String name;
        public Double rating;

        @JsonProperty("review_count")
        public Integer reviewCount;

        public String price;
        public String phone;
        public String url;

        @JsonProperty("image_url")
        public String imageUrl;

        public YelpCoordinates coordinates;
        public YelpLocation location;
        public List<YelpCategory> categories;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class YelpCoordinates {
        public Double latitude;
        public Double longitude;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class YelpLocation {
        @JsonProperty("display_address")
        public List<String> displayAddress;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class YelpCategory {
        public String title;
    }
}
