import { ApiError, apiRequest } from "@/lib/api/fetcher";
import type {
  JourneyPlanRequest,
  JourneyResponse,
  LineInfo,
  RerouteResponse,
  StopInfo,
} from "@/lib/types/api";

function isMediaTypeError(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 415 ||
      (error.message.includes("Content-Type") &&
        error.message.includes("application/json")))
  );
}

function toLegacyPlanPayload(payload: JourneyPlanRequest) {
  return {
    userId: payload.journey.userId,
    originQuery: payload.journey.originQuery,
    destinationQuery: payload.journey.destinationQuery,
    departureTime: payload.journey.departureTime,
    ecoModeEnabled: payload.journey.ecoModeEnabled,
    wheelchairAccessible: payload.journey.wheelchairAccessible,
    intermediateQuery: payload.journey.intermediateQuery,
    intermediateDepartureTime: payload.journey.intermediateDepartureTime,
    taskDetails: payload.journey.taskDetails,
    comfortMode: payload.preferences?.comfortMode ?? false,
    namedComfortSettingId: payload.preferences?.namedComfortSettingId,
  };
}

export const journeysApi = {
  async plan(payload: JourneyPlanRequest, token: string) {
    try {
      return await apiRequest<JourneyResponse[]>("/api/journeys", {
        method: "POST",
        body: payload,
        token,
      });
    } catch (error) {
      if (!isMediaTypeError(error)) {
        throw error;
      }

      return apiRequest<JourneyResponse[]>("/api/journeys", {
        method: "POST",
        body: toLegacyPlanPayload(payload),
        token,
      });
    }
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
