package org.marly.mavigo.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.marly.mavigo.controller.dto.CorridorRestaurantRequest;
import org.marly.mavigo.security.RequestOwnershipGuard;
import org.marly.mavigo.service.tourism.TourismCorridorRestaurantService;
import org.marly.mavigo.service.tourism.TourismSuggestionService;
import org.marly.mavigo.service.tourism.dto.NearbyRestaurantSearch;
import org.marly.mavigo.service.tourism.dto.TourismSuggestion;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

class TourismControllerTest {

    private TourismSuggestionService tourismSuggestionService;
    private TourismCorridorRestaurantService corridorRestaurantService;
    private RequestOwnershipGuard requestOwnershipGuard;
    private TourismController controller;

    @BeforeEach
    void setUp() {
        tourismSuggestionService = mock(TourismSuggestionService.class);
        corridorRestaurantService = mock(TourismCorridorRestaurantService.class);
        requestOwnershipGuard = mock(RequestOwnershipGuard.class);
        controller = new TourismController(tourismSuggestionService, corridorRestaurantService, requestOwnershipGuard);
    }

    @Test
    void nearbyRestaurants_clampsRadiusAndLimitAndHandlesNullServiceResponse() {
        when(tourismSuggestionService.findTopRatedRestaurantsNearby(new NearbyRestaurantSearch(48.0, 2.0, 40000, 1)))
                .thenReturn(null);

        var response = controller.nearbyRestaurants(48.0, 2.0, 99999, 0);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(List.of(), response.getBody());
    }

    @Test
    void restaurantsAlongJourney_checksOwnershipBeforeFetchingSuggestions() {
        UUID journeyId = UUID.randomUUID();
        TestingAuthenticationToken authentication = authenticatedUser();
        List<TourismSuggestion> expected = List.of(suggestion("one"));
        when(corridorRestaurantService.findAlongJourney(journeyId)).thenReturn(expected);

        var response = controller.restaurantsAlongJourney(journeyId, authentication);

        assertEquals(expected, response.getBody());
        verify(requestOwnershipGuard).requireJourneyAccess(journeyId, authentication);
    }

    @Test
    void restaurantsAlongCorridor_requiresAuthenticationAndAtLeastTwoPairs() {
        ResponseStatusException unauthenticated = assertThrows(ResponseStatusException.class,
                () -> controller.restaurantsAlongCorridor(new CorridorRestaurantRequest(List.of()), null));
        assertEquals(HttpStatus.UNAUTHORIZED, unauthenticated.getStatusCode());

        TestingAuthenticationToken authentication = authenticatedUser();
        ResponseStatusException badRequest = assertThrows(ResponseStatusException.class,
                () -> controller.restaurantsAlongCorridor(new CorridorRestaurantRequest(List.of(List.of(2.0, 48.0))),
                        authentication));
        assertEquals(HttpStatus.BAD_REQUEST, badRequest.getStatusCode());
    }

    @Test
    void restaurantsAlongCorridor_returnsSuggestionsForAuthenticatedRequest() {
        TestingAuthenticationToken authentication = authenticatedUser();
        List<List<Double>> coordinates = List.of(List.of(2.0, 48.0), List.of(2.1, 48.1));
        List<TourismSuggestion> expected = List.of(suggestion("route"));
        when(corridorRestaurantService.findAlongLngLatPairs(coordinates)).thenReturn(expected);

        var response = controller.restaurantsAlongCorridor(new CorridorRestaurantRequest(coordinates), authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(expected, response.getBody());
    }

    private static TourismSuggestion suggestion(String id) {
        return new TourismSuggestion(
                id,
                "Name",
                "Restaurant",
                null,
                "desc",
                4.5,
                20,
                "$$",
                null,
                null,
                null,
                48.0,
                2.0,
                "test",
                List.of());
    }

    private static TestingAuthenticationToken authenticatedUser() {
        TestingAuthenticationToken authentication = new TestingAuthenticationToken("user", "password");
        authentication.setAuthenticated(true);
        return authentication;
    }
}
