import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import type { ApiResult, StorefrontAdminAuthResponse } from "./types";

export const AUTH_STORAGE_KEY =
  import.meta.env.VITE_AUTH_STORAGE_KEY ?? "SuperAppAdminReact__Authentication";

// Normalize: always expose the base URL with a trailing slash so string
// concatenation like `${API_BASE_URL}User/Download` works regardless of how
// the env var is written.
const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
export const API_BASE_URL = RAW_BASE.endsWith("/") ? RAW_BASE : RAW_BASE + "/";

const RAW_STOREFRONT_BASE =
  import.meta.env.VITE_STOREFRONT_API_BASE_URL ??
  "https://storefrontbackend.novotechafrica.com/api/v1/";
export const STOREFRONT_API_BASE_URL = RAW_STOREFRONT_BASE.endsWith("/")
  ? RAW_STOREFRONT_BASE
  : RAW_STOREFRONT_BASE + "/";
export const STOREFRONT_OWNER_STORAGE_KEY =
  import.meta.env.VITE_STOREFRONT_OWNER_STORAGE_KEY ??
  "StorefrontOwnerReact__Authentication";
export const STOREFRONT_ADMIN_STORAGE_KEY =
  import.meta.env.VITE_STOREFRONT_ADMIN_STORAGE_KEY ??
  "StorefrontAdminReact__Authentication";

// Some endpoints (e.g. the Worker/sales-personnel controller) live directly
// under the host at `/api/...` rather than the versioned `/api/v1/` base.
// Expose the bare origin so those absolute URLs can be built. Falls back to the
// base URL string if it isn't a parseable absolute URL.
export const API_ORIGIN = (() => {
  try {
    return new URL(API_BASE_URL, window.location.origin).origin;
  } catch {
    return API_BASE_URL.replace(/\/+$/, "");
  }
})();

interface StoredAuth {
  accessToken: string;
}

function readToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    return parsed.accessToken ?? null;
  } catch {
    return null;
  }
}

// Decode JWT payload without a crypto dependency.
function decodeJwt(token: string): { exp?: number } | null {
  try {
    const [, payload] = token.split(".");
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isTokenValid(token: string | null | undefined): boolean {
  if (!token) return false;
  const decoded = decodeJwt(token);
  if (!decoded?.exp) return false;
  return decoded.exp * 1000 > Date.now();
}

export const http = axios.create({
  baseURL: API_BASE_URL,
  headers: { Accept: "application/json" },
});

const storefrontHttp = axios.create({
  baseURL: STOREFRONT_API_BASE_URL,
  headers: { Accept: "application/json" },
});

const storefrontAdminHttp = axios.create({
  baseURL: STOREFRONT_API_BASE_URL,
  headers: { Accept: "application/json" },
});

const storefrontAuthHttp = axios.create({
  baseURL: STOREFRONT_API_BASE_URL,
  headers: { Accept: "application/json" },
});

function readStorefrontOwnerToken(): string | null {
  try {
    const raw = localStorage.getItem(STOREFRONT_OWNER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken?: string };
    return parsed.accessToken ?? null;
  } catch {
    return null;
  }
}

storefrontHttp.interceptors.request.use((config) => {
  const token = readStorefrontOwnerToken();
  if (token && isTokenValid(token)) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>)["Authorization"] =
      `Bearer ${token}`;
  }
  return config;
});

storefrontHttp.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(STOREFRONT_OWNER_STORAGE_KEY);
      if (!window.location.pathname.toLowerCase().startsWith("/owner/login")
        && !window.location.pathname.toLowerCase().startsWith("/owner/accept")) {
        const returnUrl = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        window.location.assign(`/owner/login?returnUrl=${returnUrl}`);
      }
    }
    return Promise.reject(error);
  },
);

function readStorefrontAdminToken(): string | null {
  try {
    const raw = localStorage.getItem(STOREFRONT_ADMIN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { accessToken?: string };
    return parsed.accessToken ?? null;
  } catch {
    return null;
  }
}

storefrontAdminHttp.interceptors.request.use((config) => {
  const token = readStorefrontAdminToken();
  if (token && isTokenValid(token)) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>)["Authorization"] =
      `Bearer ${token}`;
  }
  return config;
});

storefrontAdminHttp.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(STOREFRONT_ADMIN_STORAGE_KEY);
    }
    return Promise.reject(error);
  },
);

http.interceptors.request.use((config) => {
  const token = readToken();
  if (token && isTokenValid(token)) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>)["Authorization"] =
      `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      // Avoid loops: only bounce if not already on /login
      if (!window.location.pathname.toLowerCase().startsWith("/login")) {
        const returnUrl = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        window.location.assign(`/login?returnUrl=${returnUrl}`);
      }
    }
    return Promise.reject(error);
  },
);

// Mirrors HttpService.SendMessageAsync: accepts either a Result<T> envelope or a raw T
// and always returns a uniform ApiResult<T>.
function normalize<T>(payload: unknown): ApiResult<T> {
  if (
    payload &&
    typeof payload === "object" &&
    "status" in (payload as Record<string, unknown>) &&
    typeof (payload as { status: unknown }).status === "boolean"
  ) {
    return payload as ApiResult<T>;
  }
  return {
    data: (payload ?? null) as T | null,
    message: "Operation completed successfully",
    status: true,
  };
}

function fail<T>(err: unknown): ApiResult<T> {
  const axiosErr = err as AxiosError<ApiResult<T>>;
  const data = axiosErr.response?.data;
  if (data && typeof data === "object" && "status" in data) {
    return data;
  }
  return {
    data: null,
    message: axiosErr.message ?? "An error occurred",
    status: false,
  };
}

export async function apiGet<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<ApiResult<T>> {
  try {
    const res = await http.get(url, config);
    return normalize<T>(res.data);
  } catch (err) {
    return fail<T>(err);
  }
}

export async function apiPost<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResult<T>> {
  try {
    const res = await http.post(url, data, config);
    return normalize<T>(res.data);
  } catch (err) {
    return fail<T>(err);
  }
}

export async function apiPut<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResult<T>> {
  try {
    const res = await http.put(url, data, config);
    return normalize<T>(res.data);
  } catch (err) {
    return fail<T>(err);
  }
}

export async function apiPatch<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResult<T>> {
  try {
    const res = await http.patch(url, data, config);
    return normalize<T>(res.data);
  } catch (err) {
    return fail<T>(err);
  }
}

export async function apiDelete<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<ApiResult<T>> {
  try {
    const res = await http.delete(url, config);
    return normalize<T>(res.data);
  } catch (err) {
    return fail<T>(err);
  }
}

// Owner-console requests use the storefront backend and a separate JWT from the
// SuperApp administrator session. Keeping these helpers separate prevents an owner
// token from ever being sent to an admin endpoint.
export async function storefrontApiGet<T>(
  url: string,
  config?: AxiosRequestConfig,
): Promise<ApiResult<T>> {
  try {
    const res = await storefrontHttp.get(url, config);
    return normalize<T>(res.data);
  } catch (err) {
    return fail<T>(err);
  }
}

export async function storefrontApiPost<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResult<T>> {
  try {
    const res = await storefrontHttp.post(url, data, config);
    return normalize<T>(res.data);
  } catch (err) {
    return fail<T>(err);
  }
}

/** Exchanges the current SuperApp admin session without persisting that token. */
export async function exchangeStorefrontAdminSession(
  superAppAccessToken: string,
): Promise<ApiResult<StorefrontAdminAuthResponse>> {
  try {
    const res = await storefrontAuthHttp.post(
      "auth/storefront-admin/exchange",
      undefined,
      { headers: { Authorization: `Bearer ${superAppAccessToken}` } },
    );
    const result = normalize<StorefrontAdminAuthResponse>(res.data);
    if (result.status && result.data) {
      localStorage.setItem(STOREFRONT_ADMIN_STORAGE_KEY, JSON.stringify(result.data));
    }
    return result;
  } catch (err) {
    return fail<StorefrontAdminAuthResponse>(err);
  }
}

export async function ensureStorefrontAdminSession(): Promise<
  ApiResult<StorefrontAdminAuthResponse>
> {
  try {
    const localRaw = localStorage.getItem(STOREFRONT_ADMIN_STORAGE_KEY);
    if (localRaw) {
      const localAuth = JSON.parse(localRaw) as StorefrontAdminAuthResponse;
      if (isTokenValid(localAuth.accessToken)) {
        return {
          data: localAuth,
          message: "Storefront administrator session is active",
          status: true,
        };
      }
    }

    const superAppRaw = localStorage.getItem(AUTH_STORAGE_KEY);
    const superAppAuth = superAppRaw
      ? JSON.parse(superAppRaw) as { accessToken?: string }
      : null;
    if (!superAppAuth?.accessToken) {
      return {
        data: null,
        message: "Your SuperApp administrator session has expired",
        status: false,
      };
    }
    return exchangeStorefrontAdminSession(superAppAuth.accessToken);
  } catch {
    localStorage.removeItem(STOREFRONT_ADMIN_STORAGE_KEY);
    return {
      data: null,
      message: "Storefront administrator authorization failed",
      status: false,
    };
  }
}

export async function storefrontAdminApiPost<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResult<T>> {
  try {
    const res = await storefrontAdminHttp.post(url, data, config);
    return normalize<T>(res.data);
  } catch (err) {
    return fail<T>(err);
  }
}

export async function storefrontApiPut<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResult<T>> {
  try {
    const res = await storefrontHttp.put(url, data, config);
    return normalize<T>(res.data);
  } catch (err) {
    return fail<T>(err);
  }
}

export function isStorefrontOwnerLoggedIn(): boolean {
  return isTokenValid(readStorefrontOwnerToken());
}

// Authenticated file download. Unlike `window.open(...)`, this routes through the
// axios instance so the Bearer token is attached (required by endpoints like
// Order/DownloadWorkerSales that return 401 without it). Streams the response as a
// blob and triggers a browser download, honoring the server's Content-Disposition
// filename when present. Returns an error message on failure, or null on success.
export async function downloadFile(
  url: string,
  fallbackFilename: string,
  config?: AxiosRequestConfig,
): Promise<string | null> {
  try {
    const res = await http.get(url, { ...config, responseType: "blob" });

    let filename = fallbackFilename;
    const disposition = res.headers?.["content-disposition"] as
      | string
      | undefined;
    const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^;"]+)"?/i);
    if (match?.[1]) filename = decodeURIComponent(match[1]);

    const blobUrl = URL.createObjectURL(res.data as Blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
    return null;
  } catch (err) {
    return fail<never>(err).message ?? "Download failed";
  }
}

// Multipart helper mirroring HttpService.PostFormAsync: flattens an object into a FormData
// body (arrays become indexed fields, dates serialize to ISO). Files pass through as-is.
export function toFormData(data: Record<string, unknown>, file?: File): FormData {
  const fd = new FormData();
  if (file) fd.append("ImageFile", file, file.name);
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    if (value instanceof File) {
      fd.append(key, value, value.name);
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => fd.append(`${key}[${i}]`, String(item)));
    } else if (value instanceof Date) {
      fd.append(key.toLowerCase(), value.toISOString());
    } else {
      fd.append(key.toLowerCase(), String(value));
    }
  }
  return fd;
}
