import { describe, it, expect, beforeEach, mock } from "bun:test"
import { api } from "../api"

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

describe("api client 204 handling", () => {
  it("handles 204 empty response without parse error", async () => {
    const m = mock(() => Promise.resolve(new Response(null, { status: 204 })))
    // @ts-expect-error — Bun's fetch type includes preconnect
    globalThis.fetch = m

    const result = await api.delete("/users/123")
    expect(result).toBeUndefined()

    globalThis.fetch = originalFetch
  })
})
