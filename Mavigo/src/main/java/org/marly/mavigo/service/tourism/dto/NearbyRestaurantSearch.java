package org.marly.mavigo.service.tourism.dto;

public record NearbyRestaurantSearch(
        double latitude,
        double longitude,
        int radiusMeters,
        int limit) {
}
