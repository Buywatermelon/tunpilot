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

describe("empty array API response", () => {
  it("handles empty array without crashing", async () => {
    const m = mock(() =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    )
    // @ts-expect-error — Bun's fetch type includes preconnect
    globalThis.fetch = m

    const result = await api.get<unknown[]>("/users")
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(0)

    globalThis.fetch = originalFetch
  })
})
