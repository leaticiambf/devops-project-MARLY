import { apiRequest } from "@/lib/api/fetcher";
import type { EcoDashboard } from "@/lib/types/api";

export const ecoApi = {
  getDashboard(userId: string, token: string) {
    return apiRequest<EcoDashboard>(`/api/eco/dashboard?userId=${userId}`, {
      method: "GET",
      token,
    });
  },
};
