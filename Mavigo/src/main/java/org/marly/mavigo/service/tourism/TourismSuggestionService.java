package org.marly.mavigo.service.tourism;

import java.util.List;

import org.marly.mavigo.service.tourism.dto.NearbyRestaurantSearch;
import org.marly.mavigo.service.tourism.dto.TourismSuggestion;

public interface TourismSuggestionService {
    List<TourismSuggestion> findTopRatedRestaurantsNearby(NearbyRestaurantSearch search);
}
