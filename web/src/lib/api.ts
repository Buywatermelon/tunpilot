const BASE_URL = "/api/v1"
const REQUEST_TIMEOUT_MS = 15_000

function getToken(): string | null {
  return localStorage.getItem("token")
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...init?.headers,
      },
    })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "请求超时，请稍后重试")
    }
    throw new ApiError(0, "网络错误，请检查连接")
  } finally {
    clearTimeout(timer)
  }

  if (res.status === 401) {
    localStorage.removeItem("token")
    globalThis.location.href = "/login"
    throw new ApiError(res.status, "Unauthorized")
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, (body as Record<string, string>).error ?? res.statusText)
  }

  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  put: <T>(path: string, data: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
}
