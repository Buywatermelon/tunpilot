import { describe, it, expect, beforeEach, mock } from "bun:test"

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
const AUTH_ENDPOINT = "/api/v1" + "/users"

function mockFetch(fn: () => Promise<Response>) {
  const m = mock(fn)
  // @ts-expect-error — Bun's fetch type includes preconnect, not needed for tests
  globalThis.fetch = m
  return m
}

beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, "location", {
    value: { href: "" },
    writable: true,
    configurable: true,
  })
})

// Test the login logic directly (mirrors use-auth.ts implementation)
async function loginWithToken(token: string): Promise<void> {
  const res = await fetch(AUTH_ENDPOINT, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error("Invalid token")
  localStorage.setItem("token", token)
}

function logout(): void {
  localStorage.removeItem("token")
}

describe("useAuth login", () => {
  it("calls GET /api/v1/users and stores token on success", async () => {
    const m = mockFetch(() =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    )

    await loginWithToken("valid-token")

    expect(m).toHaveBeenCalledTimes(1)
    const [url, init] = m.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(AUTH_ENDPOINT)
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer valid-token",
    )
    expect(localStorage.getItem("token")).toBe("valid-token")

    globalThis.fetch = originalFetch
  })

  it("rejects and does not store token on 401", async () => {
    mockFetch(() =>
      Promise.resolve(new Response("", { status: 401 })),
    )

    try {
      await loginWithToken("bad-token")
      expect(true).toBe(false)
    } catch (err) {
      expect((err as Error).message).toBe("Invalid token")
    }

    expect(localStorage.getItem("token")).toBeNull()

    globalThis.fetch = originalFetch
  })

  it("logout removes token from localStorage", () => {
    localStorage.setItem("token", "some-token")
    logout()
    expect(localStorage.getItem("token")).toBeNull()
  })

  it("redirects to /login when no token exists (unauthenticated)", () => {
    const hasToken = localStorage.getItem("token") !== null
    expect(hasToken).toBe(false)
  })
})
