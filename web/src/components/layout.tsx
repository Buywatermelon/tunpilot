import { type ReactNode } from "react"
import { NavLink } from "react-router-dom"
import { LayoutDashboard, Users, Server, LogOut } from "lucide-react"

interface LayoutProps {
  children: ReactNode
  onLogout: () => void
}

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/users", label: "Users", icon: Users },
  { to: "/nodes", label: "Nodes", icon: Server },
]

export function Layout({ children, onLogout }: LayoutProps) {
  return (
    <div className="flex h-screen bg-background">
      <aside className="w-60 flex flex-col border-r border-border-subtle bg-surface">
        <div className="p-6">
          <h1 className="font-heading text-xl font-bold text-text-primary tracking-tight">
            TunPilot
          </h1>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-accent-soft text-accent-hover border-l-2 border-accent"
                    : "text-text-secondary hover:bg-accent-soft/50 hover:text-text-primary"
                }`
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border-subtle">
          <button
            onClick={onLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-danger/10 hover:text-danger transition-all duration-200 cursor-pointer"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="h-14 flex items-center justify-end px-8 border-b border-border-subtle bg-surface">
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-text-secondary hover:bg-danger/10 hover:text-danger transition-all duration-200 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1200px] mx-auto px-8 py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
