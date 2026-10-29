import { useCallback, useEffect, useMemo, useState } from 'react'
import api, { TOKEN_KEY, LEGACY_TOKEN_KEY } from '../lib/api.js'
import { AuthContext } from './auth-context.js'
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const logout = useCallback(async () => {
    try { await api.post('/auth/logout') } catch { /* Clear this browser session even if the API is offline. */ }
    try { window.sessionStorage.removeItem(TOKEN_KEY) } catch { /* The current view still clears its auth state. */ }
    setUser(null)
  }, [])

  useEffect(() => {
    const clearTabSession = () => { try { window.sessionStorage.removeItem(TOKEN_KEY) } catch { /* Ignore unavailable storage. */ } }
    const onExpired = () => { clearTabSession(); setUser(null) }
    window.addEventListener('freelancerhub:session-expired', onExpired)
    try { window.localStorage.removeItem(LEGACY_TOKEN_KEY) } catch { /* Never use the former shared token key. */ }
    let token = ''
    try { token = window.sessionStorage.getItem(TOKEN_KEY) || '' } catch { /* Storage restrictions fail closed. */ }
    if (!token) {
      queueMicrotask(() => setLoading(false))
      return () => window.removeEventListener('freelancerhub:session-expired', onExpired)
    }
    api.get('/auth/me').then(({ data }) => {
      setUser(data.data)
    }).catch(() => { clearTabSession(); setUser(null) }).finally(() => setLoading(false))
    return () => window.removeEventListener('freelancerhub:session-expired', onExpired)
  }, [])

  const acceptSession = useCallback((payload) => {
    if (!payload?.user) return false
    if (payload.token) {
      try { window.sessionStorage.setItem(TOKEN_KEY, payload.token) } catch { return false }
    }
    setUser(payload.user)
    return true
  }, [])
  const value = useMemo(() => ({ user, loading, logout, acceptSession }), [user, loading, logout, acceptSession])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
