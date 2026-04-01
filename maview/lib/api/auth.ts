import { apiRequest } from "@/lib/api/fetcher";
import type { LoginRequest, LoginResponse, RegisterRequest } from "@/lib/types/api";

export const authApi = {
  login(payload: LoginRequest) {
    return apiRequest<LoginResponse>("/api/users/login", {
      method: "POST",
      body: payload,
    });
  },
  register(payload: RegisterRequest) {
    return apiRequest<LoginResponse>("/api/users", {
      method: "POST",
      body: payload,
    });
  },
  logout() {
    return apiRequest<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
    });
  },
};
