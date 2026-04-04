import { useState, useCallback } from "react"

interface UseAuthReturn {
  isAuthenticated: boolean
  login: (token: string) => Promise<void>
  logout: () => void
}

export function useAuth(): UseAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => localStorage.getItem("token") !== null,
  )

  const login = useCallback(async (token: string) => {
    const res = await fetch("/api/v1/users", {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      throw new Error("Invalid token")
    }

    localStorage.setItem("token", token)
    setIsAuthenticated(true)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem("token")
    setIsAuthenticated(false)
    globalThis.location.href = "/login"
  }, [])

  return { isAuthenticated, login, logout }
}
