export const API_URL = import.meta.env.VITE_API_URL || "";

export type AuthMode = "login" | "register";

export async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token && token !== "cloud-workbench") headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || "Something went wrong. Please try again.");
  }
  return data as T;
}

export async function authenticate(mode: AuthMode, email: string, password: string) {
  return apiRequest<{ access_token: string }>(`/api/auth/${mode}`, {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}
