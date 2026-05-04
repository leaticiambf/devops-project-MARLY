package org.marly.mavigo.service.tourism.dto;

import java.util.List;

public record TourismSuggestion(
        String id,
        String name,
        String category,
        String address,
        String description,
        Double rating,
        Integer reviewCount,
        String priceLevel,
        String imageUrl,
        String websiteUrl,
        String phone,
        Double latitude,
        Double longitude,
        String source,
        List<String> tags) {
}
