package org.marly.mavigo.controller;

import java.util.List;
import java.util.UUID;

import org.marly.mavigo.controller.dto.CorridorRestaurantRequest;
import org.marly.mavigo.security.RequestOwnershipGuard;
import org.marly.mavigo.service.tourism.TourismCorridorRestaurantService;
import org.marly.mavigo.service.tourism.TourismSuggestionService;
import org.marly.mavigo.service.tourism.dto.NearbyRestaurantSearch;
import org.marly.mavigo.service.tourism.dto.TourismSuggestion;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/tourism")
public class TourismController {

    private static final Logger LOGGER = LoggerFactory.getLogger(TourismController.class);

    private final TourismSuggestionService tourismSuggestionService;
    private final TourismCorridorRestaurantService tourismCorridorRestaurantService;
    private final RequestOwnershipGuard requestOwnershipGuard;

    public TourismController(
            TourismSuggestionService tourismSuggestionService,
            TourismCorridorRestaurantService tourismCorridorRestaurantService,
            RequestOwnershipGuard requestOwnershipGuard) {
        this.tourismSuggestionService = tourismSuggestionService;
        this.tourismCorridorRestaurantService = tourismCorridorRestaurantService;
        this.requestOwnershipGuard = requestOwnershipGuard;
    }

    @GetMapping("/nearby")
    public ResponseEntity<List<TourismSuggestion>> nearbyRestaurants(
            @RequestParam("lat") double latitude,
            @RequestParam("lng") double longitude,
            @RequestParam(defaultValue = "1200") int radius,
            @RequestParam(defaultValue = "6") int limit) {
        NearbyRestaurantSearch search = new NearbyRestaurantSearch(
                latitude,
                longitude,
                Math.max(100, Math.min(radius, 40000)),
                Math.max(1, Math.min(limit, 10)));

        List<TourismSuggestion> suggestions = tourismSuggestionService.findTopRatedRestaurantsNearby(search);
        if (suggestions == null) {
            LOGGER.warn("Tourism service returned null nearby restaurants");
            return ResponseEntity.ok(List.of());
        }

        return ResponseEntity.ok(suggestions);
    }

    @GetMapping("/journey/{journeyId}/restaurants-along-route")
    public ResponseEntity<List<TourismSuggestion>> restaurantsAlongJourney(
            @PathVariable UUID journeyId,
            Authentication authentication) {
        requestOwnershipGuard.requireJourneyAccess(journeyId, authentication);
        List<TourismSuggestion> list = tourismCorridorRestaurantService.findAlongJourney(journeyId);
        return ResponseEntity.ok(list);
    }

    @PostMapping("/corridor/restaurants")
    public ResponseEntity<List<TourismSuggestion>> restaurantsAlongCorridor(
            @RequestBody(required = false) CorridorRestaurantRequest request,
            Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }
        if (request == null || request.coordinates() == null || request.coordinates().size() < 2) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Body must include 'coordinates' with at least two [longitude, latitude] pairs");
        }
        List<TourismSuggestion> list = tourismCorridorRestaurantService.findAlongLngLatPairs(request.coordinates());
        return ResponseEntity.ok(list);
    }
}
