import { apiRequest } from "@/lib/api/fetcher";
import type {
  NearbyRestaurantParams,
  TourismSuggestion,
} from "@/lib/types/api";

function buildQuery(params: NearbyRestaurantParams) {
  const searchParams = new URLSearchParams();
  searchParams.set("lat", String(params.latitude));
  searchParams.set("lng", String(params.longitude));

  if (params.radiusMeters != null) {
    searchParams.set("radius", String(params.radiusMeters));
  }
  if (params.limit != null) {
    searchParams.set("limit", String(params.limit));
  }

  return searchParams.toString();
}

export type CorridorCoordinates = Array<[number, number]>;

export const tourismApi = {
  nearbyRestaurants(params: NearbyRestaurantParams, token: string) {
    return apiRequest<TourismSuggestion[]>(
      `/api/tourism/nearby?${buildQuery(params)}`,
      {
        method: "GET",
        token,
      },
    );
  },

  restaurantsAlongJourney(journeyId: string, token: string) {
    return apiRequest<TourismSuggestion[]>(
      `/api/tourism/journey/${encodeURIComponent(journeyId)}/restaurants-along-route`,
      {
        method: "GET",
        token,
      },
    );
  },

  restaurantsAlongCorridor(coordinates: CorridorCoordinates, token: string) {
    return apiRequest<TourismSuggestion[]>(
      "/api/tourism/corridor/restaurants",
      {
        method: "POST",
        body: { coordinates },
        token,
      },
    );
  },
};
