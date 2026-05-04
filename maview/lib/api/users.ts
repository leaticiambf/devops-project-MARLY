import { apiRequest } from "@/lib/api/fetcher";
import type {
  ComfortProfile,
  NamedComfortSetting,
  User,
} from "@/lib/types/api";

export const usersApi = {
  getById(userId: string, token: string) {
    return apiRequest<User>(`/api/users/${userId}`, {
      method: "GET",
      token,
    });
  },
  updateHomeAddress(userId: string, homeAddress: string, token: string) {
    return apiRequest<User>(`/api/users/${userId}/home-address`, {
      method: "PUT",
      body: { homeAddress },
      token,
    });
  },
  listComfortSettings(userId: string, token: string) {
    return apiRequest<NamedComfortSetting[]>(
      `/api/users/${userId}/comfort-settings`,
      {
        method: "GET",
        token,
      },
    );
  },
  createComfortSetting(
    userId: string,
    payload: { name: string; comfortProfile: ComfortProfile },
    token: string,
  ) {
    return apiRequest<NamedComfortSetting>(`/api/users/${userId}/comfort-settings`, {
      method: "POST",
      body: payload,
      token,
    });
  },
  updateComfortSetting(
    userId: string,
    settingId: string,
    payload: { name: string; comfortProfile: ComfortProfile },
    token: string,
  ) {
    return apiRequest<NamedComfortSetting>(
      `/api/users/${userId}/comfort-settings/${settingId}`,
      {
        method: "PUT",
        body: payload,
        token,
      },
    );
  },
  deleteComfortSetting(userId: string, settingId: string, token: string) {
    return apiRequest<void>(`/api/users/${userId}/comfort-settings/${settingId}`, {
      method: "DELETE",
      token,
    });
  },
  markComfortPromptSeen(userId: string, token: string) {
    return apiRequest<User>(`/api/users/${userId}/comfort-prompt-seen`, {
      method: "POST",
      token,
    });
  },
};
