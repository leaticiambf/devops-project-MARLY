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
};
