import { apiRequest } from "@/lib/api/fetcher";
import type {
  JourneyPlanRequest,
  JourneyResponse,
  LineInfo,
  RerouteResponse,
  StopInfo,
} from "@/lib/types/api";

export const journeysApi = {
  async plan(payload: JourneyPlanRequest, token: string) {
    return apiRequest<JourneyResponse[]>("/api/journeys", {
      method: "POST",
      body: payload,
      token,
    });
  },
  start(journeyId: string, token: string) {
    return apiRequest<JourneyResponse>(`/api/journeys/${journeyId}/start`, {
      method: "POST",
      token,
    });
  },
  complete(journeyId: string, token: string) {
    return apiRequest<JourneyResponse>(`/api/journeys/${journeyId}/complete`, {
      method: "POST",
      token,
    });
  },
  cancel(journeyId: string, token: string) {
    return apiRequest<JourneyResponse>(`/api/journeys/${journeyId}/cancel`, {
      method: "POST",
      token,
    });
  },
  getLines(journeyId: string, token: string) {
    return apiRequest<LineInfo[]>(`/api/journeys/${journeyId}/lines`, {
      method: "GET",
      token,
    });
  },
  getStops(journeyId: string, token: string) {
    return apiRequest<StopInfo[]>(`/api/journeys/${journeyId}/stops`, {
      method: "GET",
      token,
    });
  },
  reportLineDisruption(journeyId: string, lineCode: string, token: string) {
    return apiRequest<RerouteResponse>(
      `/api/journeys/${journeyId}/disruptions/line`,
      {
        method: "POST",
        body: { lineCode },
        token,
      },
    );
  },
  reportStationDisruption(
    journeyId: string,
    stopPointId: string,
    token: string,
  ) {
    return apiRequest<RerouteResponse>(
      `/api/journeys/${journeyId}/disruptions/station`,
      {
        method: "POST",
        body: { stopPointId },
        token,
      },
    );
  },
};
