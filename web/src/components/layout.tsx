import { type ReactNode } from "react"
import { NavLink } from "react-router-dom"
import { LayoutDashboard, Users, Server, Radio, LogOut } from "lucide-react"

interface LayoutProps {
  children: ReactNode
  onLogout: () => void
}

const navItems = [
  { to: "/", label: "概览", icon: LayoutDashboard },
  { to: "/users", label: "用户", icon: Users },
  { to: "/nodes", label: "节点", icon: Server },
  { to: "/subscriptions", label: "订阅", icon: Radio },
]

export function Layout({ children, onLogout }: LayoutProps) {
  return (
    <div className="flex h-screen bg-parchment text-ink">
      <aside className="w-[232px] flex flex-col border-r border-border-cream bg-ivory/60">
        <div className="px-6 pt-7 pb-8">
          <div className="font-serif text-[22px] font-medium tracking-[-0.01em] leading-none">
            TunPilot
          </div>
          <div className="mt-1.5 text-[11px] uppercase tracking-[0.2em] text-olive">
            管理控制台
          </div>
        </div>

        <nav className="flex-1 px-3 flex flex-col gap-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-3 h-10 rounded-[8px] text-[15px] transition-colors duration-150 ${
                  isActive
                    ? "bg-sand text-ink font-medium"
                    : "text-olive hover:bg-sand/50 hover:text-ink"
                }`
              }
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80 group-hover:opacity-100" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 w-full px-3 h-10 rounded-[8px] text-[15px] text-olive hover:bg-sand/50 hover:text-ink transition-colors duration-150 cursor-pointer"
          >
            <LogOut className="h-4 w-4 opacity-80" strokeWidth={1.75} />
            退出登录
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-[1160px] mx-auto px-10 py-14">{children}</div>
      </main>
    </div>
  )
}
