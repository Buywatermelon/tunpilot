import { describe, it, expect, beforeEach, mock } from "bun:test"
import { api, ApiError } from "../api"

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

beforeEach(() => {
  store.clear()
  store.set("token", "test-token")
})

describe("API error handling", () => {
  it("throws ApiError on non-2xx error responses", async () => {
    const m = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "Not found" }), { status: 404 }),
      ),
    )
    // @ts-expect-error — Bun's fetch type includes preconnect
    globalThis.fetch = m

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
})
