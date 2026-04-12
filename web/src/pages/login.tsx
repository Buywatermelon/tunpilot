import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/hooks/use-auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  const [token, setToken] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await login(token)
      navigate("/")
    } catch {
      setError("令牌无效，请检查后重试。")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-parchment px-6">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-10">
          <div className="font-serif text-[52px] font-medium leading-[1.10] tracking-[-0.015em] text-ink">
            TunPilot
          </div>
          <p className="mt-4 text-[17px] text-olive leading-[1.6]">
            为你的代理节点打造的安静后台。
          </p>
        </div>

        <div className="rounded-[16px] bg-ivory border border-border-cream shadow-whisper p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label
                htmlFor="token"
                className="text-[11px] font-medium uppercase tracking-[0.2em] text-olive"
              >
                API 令牌
              </label>
              <Input
                id="token"
                type="password"
                placeholder="粘贴你的令牌"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoFocus
                required
              />
              {error && <p className="text-[13px] text-error mt-1">{error}</p>}
            </div>

            <Button type="submit" size="lg" disabled={loading || !token}>
              {loading ? "验证中…" : "继续"}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-[13px] text-olive leading-[1.6]">
          在服务器设置{" "}
          <code className="font-mono text-[12px] text-ink-muted bg-sand/70 px-1.5 py-0.5 rounded">
            TUNPILOT_AUTH_TOKEN
          </code>{" "}
          即可轮换令牌。
        </p>
      </div>
    </div>
  )
}
