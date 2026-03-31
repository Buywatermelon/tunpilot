import { loadConfig } from "./config";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error: string },
  ) {
    super(body.error);
  }
}

export interface ApiClient {
  get(path: string): Promise<unknown>;
  post(path: string, body?: unknown): Promise<unknown>;
  patch(path: string, body: unknown): Promise<unknown>;
  put(path: string, body: unknown): Promise<unknown>;
  del(path: string): Promise<unknown>;
}

export function createClient(): ApiClient {
  const config = loadConfig();
  const server = config.server ?? "http://localhost:3000";
  const token = config.token;

  async function request(method: string, path: string, body?: unknown): Promise<unknown> {
    const url = `${server}/api/v1${path}`;
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });

    if (response.status === 204) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      throw new ApiError(response.status, { error: text.slice(0, 200) || `HTTP ${response.status}` });
    }

    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(response.status, data as { error: string });
    }
    return data;
  }

  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    patch: (path, body) => request("PATCH", path, body),
    put: (path, body) => request("PUT", path, body),
    del: (path) => request("DELETE", path),
  };
}
