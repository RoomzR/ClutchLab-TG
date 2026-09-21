import axios, { type AxiosError, type InternalAxiosRequestConfig, isCancel } from 'axios';
import { toast } from 'sonner';
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokenStorage';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const apiClient = axios.create({
  baseURL,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Single-flight refresh: concurrent 401s share one refresh request.
let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post<{ access_token: string; refresh_token: string }>(
      `${baseURL}/auth/refresh`,
      { refresh_token: refreshToken },
    );
    setTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    clearTokens();
    return null;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ detail?: string; message?: string }>) => {
    if (isCancel(error)) {
      return Promise.reject(error);
    }

    const status = error.response?.status;
    const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const isAuthEndpoint = config?.url?.includes('/auth/');

    if (status === 401 && config && !config._retried && !isAuthEndpoint && getRefreshToken()) {
      config._retried = true;
      refreshPromise = refreshPromise ?? tryRefresh();
      const newToken = await refreshPromise;
      refreshPromise = null;
      if (newToken) {
        config.headers.Authorization = `Bearer ${newToken}`;
        return apiClient.request(config);
      }
    }

    const message =
      error.response?.data?.detail ??
      error.response?.data?.message ??
      (error.code === 'ECONNABORTED' ? 'Request timed out' : null) ??
      (error.message === 'Network Error' ? 'Network error. Check your connection.' : null) ??
      error.message ??
      'Request failed';

    if (status !== 404 && status !== 401) {
      toast.error(typeof message === 'string' ? message : 'Request failed');
    }

    return Promise.reject(error);
  },
);

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.detail ??
      error.response?.data?.message ??
      error.message
    );
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}
