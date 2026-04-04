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
  Object.defineProperty(globalThis, "location", {
    value: { href: "" },
    writable: true,
    configurable: true,
  })
})

describe("api client 401 handling", () => {
  it("handles 401 by clearing token and redirecting to /login", async () => {
    const m = mock(() => Promise.resolve(new Response("", { status: 401 })))
    // @ts-expect-error — Bun's fetch type includes preconnect
    globalThis.fetch = m

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
})
