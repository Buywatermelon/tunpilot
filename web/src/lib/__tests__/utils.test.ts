import { describe, it, expect } from "bun:test"
import { cn, formatBytes } from "../utils"

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible")
  })
})

describe("formatBytes", () => {
  it("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B")
  })

  it("formats bytes correctly", () => {
    expect(formatBytes(1024)).toBe("1 KB")
    expect(formatBytes(1048576)).toBe("1 MB")
    expect(formatBytes(1073741824)).toBe("1 GB")
  })

  it("handles decimal precision", () => {
    expect(formatBytes(1536, 1)).toBe("1.5 KB")
  })

  it("handles NaN input without crashing", () => {
    expect(formatBytes(NaN)).toBe("0 B")
  })

  it("handles null input without crashing", () => {
    expect(formatBytes(null)).toBe("0 B")
  })

  it("handles undefined input without crashing", () => {
    expect(formatBytes(undefined)).toBe("0 B")
  })

  it("handles string number input", () => {
    expect(formatBytes("1024")).toBe("1 KB")
  })
})
