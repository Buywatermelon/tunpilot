import { describe, it, expect } from "bun:test"
import { formatBytes } from "../utils"

describe("formatBytes NaN guard", () => {
  it("handles NaN input without crashing", () => {
    expect(formatBytes(NaN)).toBe("0 B")
  })

  it("handles null input without crashing", () => {
    expect(formatBytes(null)).toBe("0 B")
  })

  it("handles undefined input without crashing", () => {
    expect(formatBytes(undefined)).toBe("0 B")
  })
})
