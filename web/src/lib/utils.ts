import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: unknown, decimals = 2): string {
  const n = Number(bytes) || 0
  if (n === 0) return "0 B"

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(n) / Math.log(k))

  return `${parseFloat((n / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}
