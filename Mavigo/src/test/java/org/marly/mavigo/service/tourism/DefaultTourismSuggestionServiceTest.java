package org.marly.mavigo.service.tourism;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.marly.mavigo.service.tourism.dto.NearbyRestaurantSearch;
import org.marly.mavigo.service.tourism.dto.TourismSuggestion;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

class DefaultTourismSuggestionServiceTest {

    @Test
    void findTopRatedRestaurantsNearby_returnsLimitedCuratedSuggestionsWithoutApiKey() {
        DefaultTourismSuggestionService service = new DefaultTourismSuggestionService(
                new RestTemplateBuilder(), "https://example.test", "");

        List<TourismSuggestion> suggestions = service.findTopRatedRestaurantsNearby(
                new NearbyRestaurantSearch(48.8566, 2.3522, 1200, 2));

        assertEquals(2, suggestions.size());
        assertEquals("curated", suggestions.getFirst().source());
    }

    @Test
    void findTopRatedRestaurantsNearby_mapsAndSortsYelpResults() {
        RestTemplate restTemplate = mock(RestTemplate.class);
        DefaultTourismSuggestionService service = new DefaultTourismSuggestionService(
                builderReturning(restTemplate), "https://yelp.test", "token");

        DefaultTourismSuggestionService.YelpBusiness weaker = yelpBusiness("2", "Second", 4.4, 200);
        DefaultTourismSuggestionService.YelpBusiness stronger = yelpBusiness("1", "First", 4.8, 10);
        DefaultTourismSuggestionService.YelpSearchResponse body = new DefaultTourismSuggestionService.YelpSearchResponse();
        body.businesses = List.of(weaker, stronger);

        when(restTemplate.exchange(any(URI.class), eq(HttpMethod.GET), any(HttpEntity.class),
                eq(DefaultTourismSuggestionService.YelpSearchResponse.class)))
                .thenReturn(ResponseEntity.ok(body));

        List<TourismSuggestion> suggestions = service.findTopRatedRestaurantsNearby(
                new NearbyRestaurantSearch(48.8566, 2.3522, 1200, 5));

        assertEquals(2, suggestions.size());
        assertEquals("First", suggestions.getFirst().name());
        assertEquals("Restaurant", suggestions.getFirst().category());
        assertEquals("French", suggestions.getFirst().tags().getFirst());
        assertNotNull(suggestions.getFirst().description());
    }

    @Test
    void findTopRatedRestaurantsNearby_fallsBackWhenYelpFailsOrReturnsNoBusinesses() {
        RestTemplate restTemplate = mock(RestTemplate.class);
        DefaultTourismSuggestionService service = new DefaultTourismSuggestionService(
                builderReturning(restTemplate), "https://yelp.test", "token");

        when(restTemplate.exchange(any(URI.class), eq(HttpMethod.GET), any(HttpEntity.class),
                eq(DefaultTourismSuggestionService.YelpSearchResponse.class)))
                .thenThrow(new RestClientException("boom"));

        List<TourismSuggestion> suggestions = service.findTopRatedRestaurantsNearby(
                new NearbyRestaurantSearch(48.8566, 2.3522, 1200, 1));

        assertEquals(1, suggestions.size());
        assertEquals("curated", suggestions.getFirst().source());
    }

    private static RestTemplateBuilder builderReturning(RestTemplate restTemplate) {
        RestTemplateBuilder builder = mock(RestTemplateBuilder.class);
        when(builder.connectTimeout(any(Duration.class))).thenReturn(builder);
        when(builder.readTimeout(any(Duration.class))).thenReturn(builder);
        when(builder.build()).thenReturn(restTemplate);
        return builder;
    }

    private static DefaultTourismSuggestionService.YelpBusiness yelpBusiness(
            String id,
            String name,
            Double rating,
            Integer reviews) {
        DefaultTourismSuggestionService.YelpBusiness business = new DefaultTourismSuggestionService.YelpBusiness();
        business.id = id;
        business.name = name;
        business.rating = rating;
        business.reviewCount = reviews;
        business.price = "$$";
        business.phone = "+33100000000";
        business.url = "https://example.test/" + id;
        business.imageUrl = "https://example.test/" + id + ".jpg";

        DefaultTourismSuggestionService.YelpCoordinates coordinates = new DefaultTourismSuggestionService.YelpCoordinates();
        coordinates.latitude = 48.8566;
        coordinates.longitude = 2.3522;
        business.coordinates = coordinates;

        DefaultTourismSuggestionService.YelpLocation location = new DefaultTourismSuggestionService.YelpLocation();
        location.displayAddress = List.of("1 Rue Test", "Paris");
        business.location = location;

        DefaultTourismSuggestionService.YelpCategory category = new DefaultTourismSuggestionService.YelpCategory();
        category.title = "French";
        business.categories = List.of(category);
        return business;
    }
}
