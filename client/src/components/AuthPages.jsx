import { useLayoutEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../lib/api.js'
import { useAuth } from '../auth/auth-context.js'
import MaterialIcon from './MaterialIcon.jsx'

const THEME_KEY = 'freelancerhub.theme'

function readTheme() {
  try {
    const savedTheme = window.localStorage.getItem(THEME_KEY)
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme
  } catch { /* Use the system preference when local storage is unavailable. */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function AuthFrame({ children, title, subtitle }) {
  const [theme, setTheme] = useState(readTheme)
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try { window.localStorage.setItem(THEME_KEY, theme) } catch { /* Theme still applies for this page session. */ }
  }, [theme])

  return <main className="auth-page"><button className="theme-toggle auth-theme-toggle" type="button" aria-label={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'} title={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}><MaterialIcon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} /></button><Link className="auth-brand" to="/"><span className="auth-brand-mark">↗</span>Freelancer<span>Hub</span></Link><section className="surface-card glass-surface auth-card"><p className="workspace-eyebrow">FREELANCERHUB LUMINA</p><h1>{title}</h1><p className="auth-subtitle">{subtitle}</p>{children}</section><p className="auth-footnote">A welcoming place to find your next project.</p></main>
}

function dashboardForRole(role) {
  return role === 'admin' ? '/admin' : role === 'client' ? '/client' : '/freelancer'
}

function safePostLoginPath(next, role) {
  const fallback = dashboardForRole(role)
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) return fallback
  try {
    const destination = new URL(next, window.location.origin)
    if (destination.origin !== window.location.origin) return fallback
    const roleRoot = dashboardForRole(role)
    const roleOwnedPath = destination.pathname === roleRoot || destination.pathname.startsWith(`${roleRoot}/`)
    if (!roleOwnedPath && !['/workspace', '/account'].includes(destination.pathname)) return fallback
    return `${destination.pathname}${destination.search}${destination.hash}`
  } catch {
    return fallback
  }
}

export function LoginPage() {
  const { acceptSession } = useAuth()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const { data } = await api.post('/auth/login', { email, password })
      if (!acceptSession(data.data)) { setError('This tab could not store its session. Enable session storage and try again.'); return }
      navigate(safePostLoginPath(search.get('next'), data.data.user.role), { replace: true })
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not connect to the sign-in service. Check that the backend is running.') }
    finally { setBusy(false) }
  }
  return <AuthFrame title="Welcome back" subtitle="Sign in to continue to your FreelancerHub workspace."><form className="auth-form" onSubmit={submit}><label>Email address<input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><label>Password<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <span>→</span></button></form><div className="auth-divider"><span>New to FreelancerHub?</span></div><p className="auth-links"><Link to="/register/freelancer">Join as a freelancer</Link><Link to="/register/client">Join as a client</Link></p><div className="auth-demo-note"><strong>Development demo accounts</strong><div className="demo-login-buttons">{[['Admin', 'admin@freelancerhub.demo'], ['Client', 'client@freelancerhub.demo'], ['Freelancer', 'freelancer@freelancerhub.demo']].map(([label, demoEmail]) => <button type="button" key={label} onClick={() => setEmail(demoEmail)}>{label}</button>)}</div>Choose an email above after running <code>npm run seed:demo</code>. Use the local <code>DEMO_PASSWORD</code> value as its password.</div></AuthFrame>
}

export function RegisterPage({ role }) {
  const { acceptSession } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const { data } = await api.post('/auth/register', { name, email, password, role })
      if (!acceptSession(data.data)) { setError('This tab could not store its session. Enable session storage and try again.'); return }
      navigate(role === 'client' ? '/client' : '/freelancer', { replace: true })
    } catch (requestError) { setError(requestError.response?.data?.message || 'Could not connect to the registration service. Check that the backend is running.') }
    finally { setBusy(false) }
  }
  const label = role === 'client' ? 'Client' : 'Freelancer'
  return <AuthFrame title={`Join as a ${label.toLowerCase()}`} subtitle={role === 'client' ? 'Find skilled people to help move your projects forward.' : 'Find projects that match the skills you are building.'}><form className="auth-form" onSubmit={submit}><label>Your name<input autoComplete="name" minLength="2" maxLength="80" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Full name" /></label><label>Email address<input autoComplete="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><label>Password<input autoComplete="new-password" type="password" minLength="10" maxLength="72" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="10–72 characters" /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Creating account…' : `Create ${label.toLowerCase()} account`} <span>→</span></button></form><p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p><p className="auth-demo-note">You can add skills and profile details after registration.</p></AuthFrame>
}
