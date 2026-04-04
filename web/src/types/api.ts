export interface User {
  id: string
  name: string
  email: string
  status: "active" | "disabled"
  trafficLimit: number
  trafficUsed: number
  expiresAt: string
  createdAt: string
}

export interface Node {
  id: string
  name: string
  host: string
  port: number
  protocol: string
  status: string
  createdAt: string
}
