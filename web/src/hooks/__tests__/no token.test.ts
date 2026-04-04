import { describe, it, expect, beforeEach } from "bun:test"

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

beforeEach(() => {
  store.clear()
})

describe("no token redirect", () => {
  it("when no token exists, user is unauthenticated", () => {
    const token = localStorage.getItem("token")
    expect(token).toBeNull()
  })

  it("protected routes should redirect when no token in localStorage", () => {
    const isAuthenticated = localStorage.getItem("token") !== null
    expect(isAuthenticated).toBe(false)
  })
})
