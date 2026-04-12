export interface User {
  id: string
  name: string
  quota_bytes: number
  used_bytes: number
  expires_at: string | null
  max_devices: number
  enabled: number
  created_at: string
}

export interface Node {
  id: string
  name: string
  host: string
  port: number
  protocol: string
  enabled: number
  created_at: string
}

export interface Subscription {
  id: string
  user_id: string
  token: string
  format: string
  created_at: string
}

export interface NodeHealth {
  id: string
  name: string
  status: "online" | "offline" | "degraded" | "disabled" | "unknown" | string
}

export interface HealthResponse {
  nodes: NodeHealth[]
}

export interface InfoResponse {
  base_url: string
}
