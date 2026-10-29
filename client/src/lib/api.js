import axios from 'axios'

const TOKEN_KEY = 'freelancerhub.tab-session'
const LEGACY_TOKEN_KEY = 'freelancerhub.token'
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'
const configuredApiOrigin = new URL(API_BASE_URL, window.location.origin).origin
const api = axios.create({ baseURL: API_BASE_URL, timeout: 12000, withCredentials: false })
api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase()
  if (['post', 'put', 'patch', 'delete'].includes(method)) config.headers['X-CSRF-Protection'] = '1'
  let token = ''
  try { token = window.sessionStorage.getItem(TOKEN_KEY) || '' } catch { /* Storage restrictions fail closed. */ }
  const base = new URL(config.baseURL || API_BASE_URL, window.location.origin)
  const target = new URL(config.url || '', base)
  if (token && target.origin === configuredApiOrigin) config.headers.Authorization = `Bearer ${token}`
  return config
})
api.interceptors.response.use((response) => response, (error) => {
  const url = error.config?.url || ''
  if (error.response?.status === 401 && !/^\/auth\/(login|register)(?:\?|$)/.test(url)) {
    try { window.sessionStorage.removeItem(TOKEN_KEY) } catch { /* The current view still clears its auth state. */ }
    window.dispatchEvent(new CustomEvent('freelancerhub:session-expired'))
  }
  return Promise.reject(error)
})

export { TOKEN_KEY, LEGACY_TOKEN_KEY }
export default api
