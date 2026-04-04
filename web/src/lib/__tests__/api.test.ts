import { describe, it, expect, beforeEach, mock } from "bun:test"
import { api, ApiError } from "../api"

// Polyfill localStorage for test environment
const store = new Map<string, string>()
const mockStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size },
  key: (_index: number) => null,
}
Object.defineProperty(globalThis, "localStorage", { value: mockStorage, configurable: true })

const originalFetch = globalThis.fetch

function mockFetch(fn: () => Promise<Response>) {
  const m = mock(fn)
  // @ts-expect-error — Bun's fetch type includes preconnect, not needed for tests
  globalThis.fetch = m
  return m
}

beforeEach(() => {
  store.clear()
  store.set("token", "test-token")

  Object.defineProperty(globalThis, "location", {
    value: { href: "" },
    writable: true,
    configurable: true,
  })
})

describe("api client", () => {
  it("sends Authorization header from localStorage", async () => {
    const m = mockFetch(() =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    )

    await api.get("/users")

    expect(m).toHaveBeenCalledTimes(1)
    const [, init] = m.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer test-token")

    globalThis.fetch = originalFetch
  })

  it("handles 401 by clearing token and redirecting to /login", async () => {
    mockFetch(() =>
      Promise.resolve(new Response("", { status: 401 })),
    )

    try {
      await api.get("/protected")
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(401)
    }

    expect(localStorage.getItem("token")).toBeNull()
    expect(globalThis.location.href).toBe("/login")

    globalThis.fetch = originalFetch
  })

  it("handles 204 empty response without parse error", async () => {
    mockFetch(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    )

    const result = await api.delete("/users/123")
    expect(result).toBeUndefined()

    globalThis.fetch = originalFetch
  })

  it("throws ApiError on non-2xx error responses", async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
      ),
    )

    try {
      await api.get("/missing")
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(404)
      expect((err as ApiError).message).toBe("Not found")
    }

    globalThis.fetch = originalFetch
  })

  it("handles empty array API response", async () => {
    mockFetch(() =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    )

    const result = await api.get<unknown[]>("/users")
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)

    globalThis.fetch = originalFetch
  })
})
