import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Dashboard from './components/Dashboard.jsx'
import Workspace, { AccountPage } from './components/Workspace.jsx'
import { LoginPage, RegisterPage } from './components/AuthPages.jsx'
import StartupLoader from './components/StartupLoader.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import { useAuth } from './auth/auth-context.js'
import './components/Workspace.css'
import './Luminous.css'

function Protected({ children, roles }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <main className="auth-page"><p role="status">Checking your session…</p></main>
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/workspace" replace />
  return children
}

function StartPage() {
  return <Dashboard />
}

function AppRoutes() {
  return <Routes>
    <Route path="/" element={<StartPage />} />
    <Route path="/login" element={<LoginPage />} />
    <Route path="/register/freelancer" element={<RegisterPage role="freelancer" />} />
    <Route path="/register/client" element={<RegisterPage role="client" />} />
    <Route path="/workspace" element={<Protected><Workspace /></Protected>} />
    <Route path="/account" element={<Protected><AccountPage /></Protected>} />
    <Route path="/client/*" element={<Protected roles={['client']}><Workspace /></Protected>} />
    <Route path="/freelancer/*" element={<Protected roles={['freelancer']}><Workspace /></Protected>} />
    <Route path="/admin/*" element={<Protected roles={['admin']}><Workspace /></Protected>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
}

function App() {
  const [showLoader, setShowLoader] = useState(true)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const exitTimer = window.setTimeout(() => setIsLeaving(true), reduceMotion ? 380 : 1260)
    const removeTimer = window.setTimeout(() => setShowLoader(false), reduceMotion ? 520 : 1480)
    return () => { window.clearTimeout(exitTimer); window.clearTimeout(removeTimer) }
  }, [])

  return <BrowserRouter><AuthProvider><div className="app-underlay" inert={showLoader} aria-hidden={showLoader ? 'true' : undefined}><AppRoutes /></div>{showLoader && <StartupLoader isLeaving={isLeaving} />}</AuthProvider></BrowserRouter>
}

export default App
