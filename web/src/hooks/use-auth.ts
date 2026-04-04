import { useState, useCallback } from "react"

interface UseAuthReturn {
  isAuthenticated: boolean
  login: (token: string) => Promise<void>
  logout: () => void
}

export async function loginWithToken(token: string): Promise<void> {
  const res = await fetch("/api/v1/users", {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    throw new Error("Invalid token")
  }

  localStorage.setItem("token", token)
}

export function clearAuth(): void {
  localStorage.removeItem("token")
}

export function useAuth(): UseAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem("token") !== null,
  )

  const login = useCallback(async (token: string) => {
    await loginWithToken(token)
    setIsAuthenticated(true)
  }, [])

  const logout = useCallback(() => {
    clearAuth()
    setIsAuthenticated(false)
    globalThis.location.href = "/login"
  }, [])

  return { isAuthenticated, login, logout }
}
