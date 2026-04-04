import { describe, it, expect, beforeEach, mock } from "bun:test"
import { loginWithToken } from "../use-auth"

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
})

describe("login flow", () => {
  it("calls GET /api/v1/users and stores token on 200", async () => {
    const m = mock(() =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    )
    // @ts-expect-error — Bun's fetch type includes preconnect
    globalThis.fetch = m

    await loginWithToken("valid-token")

    expect(m).toHaveBeenCalledTimes(1)
    const [url, init] = m.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/v1/users")
    expect((init as RequestInit).method ?? "GET").toBe("GET")
    expect(localStorage.getItem("token")).toBe("valid-token")

    globalThis.fetch = originalFetch
  })

  it("rejects and does not store token on 401", async () => {
    const m = mock(() =>
      Promise.resolve(new Response("", { status: 401 })),
    )
    // @ts-expect-error — Bun's fetch type includes preconnect
    globalThis.fetch = m

    try {
      await loginWithToken("bad-token")
      expect(true).toBe(false)
    } catch (err) {
      expect((err as Error).message).toBe("Invalid token")
    }

    expect(localStorage.getItem("token")).toBeNull()

    globalThis.fetch = originalFetch
  })
})
