import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const THEME_KEY = 'freelancerhub.theme'
let initialTheme = ''
try { initialTheme = window.localStorage.getItem(THEME_KEY) || '' } catch { /* Continue with the system preference. */ }
if (initialTheme !== 'light' && initialTheme !== 'dark') {
  initialTheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
document.documentElement.dataset.theme = initialTheme
document.documentElement.style.colorScheme = initialTheme

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
