import axios, { AxiosError } from "axios";

// withCredentials: true is required for the session cookie to be sent
// cross-origin (the web app on :3000 calling the API on :4000). Without
// this the browser strips the cookie from every request and the user
// appears logged out on every API call, even immediately after login.
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    const isLoginPage = typeof window !== "undefined" && window.location.pathname === "/login";

    if (error.response?.status === 401 && !isLoginPage) {
      window.location.href = "/login";
    }

    const message = error.response?.data?.message ?? GENERIC_ERROR_MESSAGE;
    return Promise.reject(new Error(message));
  },
);

interface MeResponse {
  id: string;
  email: string;
  fullName: string;
  role: string;
  mfaEnabled: boolean;
}

interface LoginResponse {
  message: string;
  requiresMfa: boolean;
  role: string;
}

export const authApi = {
  login: (email: string, password: string, captchaToken?: string) =>
    apiClient
      .post<LoginResponse>("/auth/login", { email, password, captchaToken })
      .then((res) => res.data),

  logout: () => apiClient.post<{ message: string }>("/auth/logout").then((res) => res.data),

  me: () => apiClient.get<MeResponse>("/auth/me").then((res) => res.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient
      .post<{ message: string }>("/auth/change-password", { currentPassword, newPassword })
      .then((res) => res.data),

  setupMfa: () =>
    apiClient
      .post<{ otpauthUrl: string; qrCodeDataUrl: string }>("/auth/mfa/setup")
      .then((res) => res.data),

  verifyMfaSetup: (token: string, secret: string) =>
    apiClient
      .post<{ message: string }>("/auth/mfa/verify-setup", { token, secret })
      .then((res) => res.data),

  verifyMfa: (token: string) =>
    apiClient.post<{ message: string }>("/auth/mfa/verify", { token }).then((res) => res.data),

  requestPasswordReset: (email: string) =>
    apiClient
      .post<{ message: string }>("/auth/request-password-reset", { email })
      .then((res) => res.data),

  resetPassword: (token: string, newPassword: string) =>
    apiClient
      .post<{ message: string }>("/auth/reset-password", { token, newPassword })
      .then((res) => res.data),
};
