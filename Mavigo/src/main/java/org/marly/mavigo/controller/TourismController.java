package org.marly.mavigo.controller;

import java.util.List;

import org.marly.mavigo.service.tourism.TourismSuggestionService;
import org.marly.mavigo.service.tourism.dto.NearbyRestaurantSearch;
import org.marly.mavigo.service.tourism.dto.TourismSuggestion;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
@RequestMapping("/api/tourism")
public class TourismController {

    private static final Logger LOGGER = LoggerFactory.getLogger(TourismController.class);

    private final TourismSuggestionService tourismSuggestionService;

    public TourismController(TourismSuggestionService tourismSuggestionService) {
        this.tourismSuggestionService = tourismSuggestionService;
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
}
