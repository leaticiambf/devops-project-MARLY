package org.marly.mavigo.controller.dto;

import java.util.List;

public record CorridorRestaurantRequest(List<List<Double>> coordinates) {
}
