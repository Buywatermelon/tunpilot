import { Routes, Route, Navigate } from "react-router-dom"
import { useAuth } from "@/hooks/use-auth"
import { Layout } from "@/components/layout"
import LoginPage from "@/pages/login"
import DashboardPage from "@/pages/dashboard"

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

function AuthenticatedLayout() {
  const { logout } = useAuth()
  return (
    <Layout onLogout={logout}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/users" element={<PlaceholderPage title="Users" />} />
        <Route path="/users/:id" element={<PlaceholderPage title="User Detail" />} />
        <Route path="/nodes" element={<PlaceholderPage title="Nodes" />} />
      </Routes>
    </Layout>
  )
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold text-text-primary mb-6">{title}</h1>
      <p className="text-text-secondary">Coming soon.</p>
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AuthenticatedLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
