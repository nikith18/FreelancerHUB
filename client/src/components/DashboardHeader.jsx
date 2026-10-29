import { useState } from 'react'
import { useAuth } from '../auth/auth-context.js'
import MaterialIcon from './MaterialIcon.jsx'

export default function DashboardHeader({ theme, onThemeToggle }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user } = useAuth()

  return (
    <header className="site-header glass-surface" id="top">
      <a className="brand" href="#top" aria-label="FreelancerHub home">
        <span className="brand-mark" aria-hidden="true"><MaterialIcon name="north_east" /></span>
        <span>Freelancer<span className="brand-accent">Hub</span></span>
      </a>
      <button
        className="mobile-menu-toggle"
        type="button"
        aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={menuOpen}
        aria-controls="public-navigation"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <MaterialIcon name={menuOpen ? 'close' : 'menu'} />
      </button>
      <nav className={`primary-nav${menuOpen ? ' is-open' : ''}`} id="public-navigation" aria-label="Main navigation">
        <a className="nav-link active" href="#job-feed" aria-current="page" onClick={() => setMenuOpen(false)}>Explore jobs</a>
        <a className="nav-link" href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
        {user ? <a className="nav-link" href="/workspace" onClick={() => setMenuOpen(false)}>Workspace</a> : <a className="nav-link" href="/login" onClick={() => setMenuOpen(false)}>Sign in</a>}
      </nav>
      <button className="theme-toggle" type="button" aria-label={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'} title={theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance'} onClick={onThemeToggle}>
        <MaterialIcon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} />
      </button>
      <a className="header-action" href={user ? '/workspace' : '/register/freelancer'}>{user ? 'Open workspace' : 'Join FreelancerHub'} <MaterialIcon name="arrow_forward" /></a>
    </header>
  )
}
