import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardPage from './pages/DashboardPage'
import CalendarPage from './pages/CalendarPage'
import InvitationAcceptancePage from './pages/InvitationAcceptancePage'
import LoginPage from './pages/LoginPage'
import ProjectWorkspacePage from './pages/ProjectWorkspacePage'
import ProjectsPage from './pages/ProjectsPage'
import RegisterPage from './pages/RegisterPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="app-shell">
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/invitations/:token" element={<InvitationAcceptancePage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:projectId" element={<ProjectWorkspacePage />} />
            </Route>
            <Route path="*" element={<main className="auth-card"><h1>Page not found</h1></main>} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}
