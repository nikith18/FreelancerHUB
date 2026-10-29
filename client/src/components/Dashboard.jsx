import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../lib/api.js'
import { useAuth } from '../auth/auth-context.js'
import DashboardHeader from './DashboardHeader.jsx'
import FilterSidebar from './FilterSidebar.jsx'
import JobCard from './JobCard.jsx'
import MaterialIcon from './MaterialIcon.jsx'
import './Dashboard.css'

const PAGE_SIZE = 12
const emptyFilters = { jobType: '', currency: '', minBudget: '', maxBudget: '', sort: 'newest' }
const SAVED_JOBS_KEY = 'freelancerhub.savedJobs'
const THEME_KEY = 'freelancerhub.theme'

async function describeJobsError(requestError) {
  if (requestError.code === 'ECONNABORTED' || requestError.code === 'ETIMEDOUT') {
    return { title: 'The request timed out', message: 'The listings service took too long to respond. Check your connection and try again.' }
  }
  if (requestError.response?.status === 503) {
    return { title: 'Listings are temporarily unavailable', message: requestError.response.data?.message || 'The database is disconnected. Try again after it reconnects.' }
  }
  if (requestError.response?.status === 401) {
    return { title: 'Sign in required', message: 'Your account needs to be signed in to view these listings.' }
  }
  if (!requestError.response || requestError.response.status >= 500) {
    try {
      const health = await api.get('/health', { timeout: 3000 })
      if (health.data?.database === 'disconnected') {
        return { title: 'Listings are temporarily unavailable', message: 'The database is disconnected. Try again after it reconnects.' }
      }
    } catch {
      if (!requestError.response || [502, 503, 504].includes(requestError.response.status)) {
        return { title: 'The backend is unavailable', message: 'The API server could not be reached. Start the backend, then try again.' }
      }
    }
  }
  return { title: 'We couldn’t load the listings', message: 'The server could not complete this request. Please try again.' }
}

function readTheme() {
  try {
    const savedTheme = window.localStorage.getItem(THEME_KEY)
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme
  } catch { /* Use the system preference when local storage is unavailable. */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readSavedJobs() {
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVED_JOBS_KEY) || '[]')
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function JobDetailsDialog({ jobId, onClose, user }) {
  const [job, setJob] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [proposal, setProposal] = useState({ message: '', proposedBudget: '', duration: '' })
  const [proposalError, setProposalError] = useState('')
  const [proposalSent, setProposalSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const closeButtonRef = useRef(null)

  useEffect(() => {
    if (!jobId) return undefined
    const controller = new AbortController()
    const previousFocus = document.activeElement
    document.body.classList.add('dialog-open')
    closeButtonRef.current?.focus()

    api.get(`/jobs/${jobId}`, { signal: controller.signal })
      .then(({ data }) => setJob(data.data))
      .catch((requestError) => {
        if (requestError.name !== 'CanceledError') {
          setError(requestError.response?.status === 404 ? 'This listing is no longer available.' : 'Could not load the job details. Please try again.')
        }
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })

    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab') {
        const focusable = document.querySelectorAll('.job-dialog button:not([disabled]), .job-dialog a[href], .job-dialog input:not([disabled])')
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      controller.abort()
      document.body.classList.remove('dialog-open')
      document.removeEventListener('keydown', onKeyDown)
      if (previousFocus instanceof HTMLElement) previousFocus.focus()
    }
  }, [jobId, onClose])

  const amount = Number(job?.budget)
  const formattedBudget = job && Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: job.currency || 'USD', maximumFractionDigits: 2 }).format(amount)
    : ''

  async function submitProposal(event) {
    event.preventDefault(); setProposalError(''); setSubmitting(true)
    try {
      await api.post('/applications', { jobId, ...proposal, proposedBudget: Number(proposal.proposedBudget) })
      setProposalSent(true)
    } catch (requestError) { setProposalError(requestError.response?.data?.message || 'Unable to send your proposal right now.') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="job-dialog glass-surface" role="dialog" aria-modal="true" aria-labelledby="job-dialog-title">
        <div className="dialog-header">
          <span className="dialog-kicker">JOB DETAILS</span>
          <button ref={closeButtonRef} className="dialog-close" type="button" aria-label="Close job details" onClick={onClose}><MaterialIcon name="close" /></button>
        </div>
        {isLoading ? <p className="dialog-status" role="status">Loading job details…</p> : error ? <p className="dialog-status error-text" role="alert">{error}</p> : job && (
          <>
            <h2 id="job-dialog-title">{job.title}</h2>
            <div className="dialog-meta">
              <span><MaterialIcon name="payments" />{formattedBudget}</span>
              <span><MaterialIcon name={job.jobType === 'hourly' ? 'schedule' : 'work'} />{job.jobType === 'hourly' ? 'Hourly' : 'Fixed price'}</span>
              {job.category && <span><MaterialIcon name="folder_open" />{job.category}</span>}
            </div>
            <div className="dialog-section"><h3>Project description</h3><p>{job.description}</p></div>
            {job.requiredSkills?.length > 0 && <div className="dialog-section"><h3>Required skills</h3><ul className="job-tags">{job.requiredSkills.map((skill) => <li key={skill}>{skill}</li>)}</ul></div>}
            {job.deadline && <div className="dialog-section"><h3>Deadline</h3><p>{new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(job.deadline))}</p></div>}
            {user?.role === 'freelancer' && (proposalSent ? <div className="dialog-notice"><MaterialIcon name="check_circle" /><p>Your proposal was sent. You can track its status from your workspace.</p></div> : <form className="dialog-apply-form" onSubmit={submitProposal}><h3>Send a proposal</h3><label>Your message<textarea required minLength="20" maxLength="3000" rows="4" value={proposal.message} onChange={(e) => setProposal({ ...proposal, message: e.target.value })} placeholder="Explain how you would approach this work…" /></label><div className="proposal-form-row"><label>Your proposed budget<input required type="number" min="1" step="0.01" value={proposal.proposedBudget} onChange={(e) => setProposal({ ...proposal, proposedBudget: e.target.value })} /></label><label>Estimated duration<input required maxLength="80" value={proposal.duration} onChange={(e) => setProposal({ ...proposal, duration: e.target.value })} placeholder="e.g. 2 weeks" /></label></div>{proposalError && <p className="error-text" role="alert">{proposalError}</p>}<button className="button button-primary" disabled={submitting}>{submitting ? 'Sending…' : 'Send proposal'} <MaterialIcon name="arrow_forward" /></button></form>)}
            {!user && <div className="dialog-notice"><MaterialIcon name="info" /><p><Link to={`/login?next=${encodeURIComponent('/')}`}>Sign in as a freelancer</Link> to send a proposal.</p></div>}
            {user && user.role !== 'freelancer' && <div className="dialog-notice"><MaterialIcon name="info" /><p>Only freelancer accounts can send proposals.</p></div>}
          </>
        )}
      </section>
    </div>
  )
}

function SearchHero({ value, onValueChange, onSearch }) {
  return (
    <section className="search-hero glass-surface" aria-labelledby="hero-title">
      <div className="hero-content">
        <span className="hero-eyebrow"><span className="eyebrow-mark" />A marketplace for emerging talent</span>
        <h1 id="hero-title">Make your next move <span>count.</span></h1>
        <p>Find thoughtful freelance projects with clear expectations, fair budgets, and room to grow.</p>
        <form className="hero-search" role="search" onSubmit={(event) => { event.preventDefault(); onSearch() }}>
          <label className="search-input-wrap">
            <MaterialIcon name="search" />
            <span className="visually-hidden">Search jobs by title, skill, or keyword</span>
            <input type="search" value={value} onChange={(event) => onValueChange(event.target.value)} placeholder="Job title, skill, or keyword" />
          </label>
          <button className="button button-primary" type="submit"><span>Search jobs</span><MaterialIcon name="arrow_forward" /></button>
        </form>
        <p className="search-caption"><MaterialIcon name="verified_user" />Browse real projects. Apply when the fit feels right.</p>
      </div>
      <aside className="hero-preview glass-surface" aria-label="Example freelance project">
        <div className="preview-topline"><span className="preview-label"><MaterialIcon name="work_outline" />LISTING PREVIEW</span><span className="preview-status"><span />Example</span></div>
        <p className="preview-category">DESIGN &amp; CREATIVE</p>
        <h2>Build a brand that feels unmistakably yours</h2>
        <p className="preview-description">Create a polished identity system for a new independent coffee studio.</p>
        <div className="preview-skills"><span>Brand identity</span><span>Figma</span><span>Packaging</span></div>
        <div className="preview-divider" />
        <div className="preview-bottom"><span><small>PROJECT BUDGET</small><strong>$800 <em>fixed price</em></strong></span><span className="preview-client"><span className="preview-avatar">N</span><span><small>CLIENT</small><strong>Northline Studio</strong></span></span></div>
        <div className="preview-note"><MaterialIcon name="task_alt" /><span><strong>Clear scope</strong><small>Know what you’re applying for</small></span></div>
      </aside>
    </section>
  )
}

function JobResults({ jobs, isLoading, error, hasSearched, onRetry, onViewDetails, savedJobs, onToggleSaved }) {
  if (isLoading) {
    return <div className="results-grid" aria-label="Loading job listings" aria-busy="true">{Array.from({ length: 4 }, (_, index) => <div className="job-skeleton" key={index}><span /><span /><span /><span /></div>)}</div>
  }
  if (error) {
    return <div className="state-panel glass-surface error-panel" role="alert"><span className="state-icon"><MaterialIcon name="cloud_off" /></span><h3>{error.title}</h3><p>{error.message}</p>{error.title !== 'Check your filters' && <button className="button button-secondary" type="button" onClick={onRetry}>Try again</button>}</div>
  }
  if (jobs.length === 0) {
    return <div className="state-panel glass-surface"><span className="state-icon"><MaterialIcon name={hasSearched ? 'manage_search' : 'work_outline'} /></span><h3>{hasSearched ? 'No matching listings' : 'No open listings yet'}</h3><p>{hasSearched ? 'Try another keyword or adjust your filters.' : 'New opportunities will appear here when clients post them.'}</p></div>
  }
  return <div className="results-grid">{jobs.map((job) => <JobCard key={job._id} job={job} isSaved={savedJobs.includes(job._id)} onToggleSaved={onToggleSaved} onViewDetails={onViewDetails} />)}</div>
}

export default function Dashboard({ className = '' }) {
  const { user } = useAuth()
  const [theme, setTheme] = useState(readTheme)
  const [jobs, setJobs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [requestVersion, setRequestVersion] = useState(0)
  const [loadedRequestKey, setLoadedRequestKey] = useState('')
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState(emptyFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [savedJobs, setSavedJobs] = useState(readSavedJobs)
  const [selectedJobId, setSelectedJobId] = useState('')
  const closeJobDetails = useCallback(() => setSelectedJobId(''), [])
  const currency = filters.currency.trim()
  const minimum = filters.minBudget.trim()
  const maximum = filters.maxBudget.trim()
  const validationError = currency && !/^[A-Z]{3}$/.test(currency)
    ? 'Enter a valid 3-letter currency code, such as USD.'
    : (minimum || maximum || filters.sort !== 'newest') && !currency
      ? 'Choose a currency before filtering or sorting by budget.'
      : minimum && maximum && Number(minimum) > Number(maximum)
        ? 'Minimum budget must be less than or equal to maximum budget.'
        : ''
  const requestParams = {
    page,
    limit: PAGE_SIZE,
    search: searchTerm.trim() || undefined,
    jobType: filters.jobType || undefined,
    currency: currency || undefined,
    minBudget: minimum || undefined,
    maxBudget: maximum || undefined,
    sort: filters.sort,
  }
  const requestKey = JSON.stringify({ params: requestParams, version: requestVersion })
  const isLoading = !validationError && loadedRequestKey !== requestKey

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try { window.localStorage.setItem(THEME_KEY, theme) } catch { /* Theme still applies for this page session. */ }
  }, [theme])

  useEffect(() => {
    const controller = new AbortController()
    if (validationError) return () => controller.abort()
    const params = JSON.parse(requestKey).params
    api.get('/jobs', {
      params,
      signal: controller.signal,
      timeout: 12000,
    }).then(({ data }) => {
      setJobs(Array.isArray(data.data) ? data.data : [])
      setTotal(data.pagination?.total ?? 0)
      setPages(Math.max(data.pagination?.pages ?? 1, 1))
      setError('')
    }).catch(async (requestError) => {
      if (requestError.name === 'CanceledError') return
      setJobs([])
      setTotal(0)
      setPages(1)
      setError(await describeJobsError(requestError))
    }).finally(() => { if (!controller.signal.aborted) setLoadedRequestKey(requestKey) })
    return () => controller.abort()
  }, [requestKey, validationError])

  function applyFilters(nextFilters) {
    setFilters(nextFilters)
    setPage(1)
  }

  function clearFilters() {
    setFilters(emptyFilters)
    setSearchInput('')
    setSearchTerm('')
    setPage(1)
  }

  function toggleSaved(jobId) {
    setSavedJobs((current) => {
      const next = current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId]
      try { window.localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify(next)) } catch { /* Saving still works for this page session. */ }
      return next
    })
  }

  const activeFilterCount = Number(Boolean(filters.jobType)) + Number(Boolean(filters.currency || filters.minBudget || filters.maxBudget))
  const hasSearchOrFilters = Boolean(searchTerm.trim()) || activeFilterCount > 0

  return (
    <div className={`dashboard-shell ${className}`}>
      <DashboardHeader theme={theme} onThemeToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} />
      <main>
        <div className="page-container">
          <SearchHero value={searchInput} onValueChange={setSearchInput} onSearch={() => { setSearchTerm(searchInput); setPage(1) }} />

          <section className="pathways-section" aria-labelledby="pathways-title">
            <div className="pathways-heading"><span className="section-kicker">ONE MARKETPLACE, TWO WAYS FORWARD</span><h2 id="pathways-title">Start with what you need.</h2></div>
            <div className="pathways-grid">
              <article className="pathway-card glass-surface freelancer-pathway">
                <span className="pathway-icon"><MaterialIcon name="person_search" /></span>
                <div className="pathway-copy"><span className="pathway-label">FOR FREELANCERS</span><h3>Find work that fits your skills.</h3><p>Explore clear project briefs, compare budgets, and send a proposal when it feels right.</p><a className="pathway-link" href="#job-feed">Explore open jobs <MaterialIcon name="arrow_forward" /></a></div>
                <MaterialIcon className="pathway-watermark" name="work_outline" />
              </article>
              <article className="pathway-card glass-surface client-pathway">
                <span className="pathway-icon"><MaterialIcon name="business_center" /></span>
                <div className="pathway-copy"><span className="pathway-label">FOR CLIENTS</span><h3>Bring your next idea to life.</h3><p>Post a project, review proposals from emerging talent, and keep the work moving.</p><Link className="pathway-link" to={user?.role === 'client' ? '/workspace' : '/register/client'}>{user?.role === 'client' ? 'Open your workspace' : 'Hire with FreelancerHub'} <MaterialIcon name="arrow_forward" /></Link></div>
                <MaterialIcon className="pathway-watermark" name="task_alt" />
              </article>
            </div>
          </section>

          <section className="marketplace-section" id="job-feed" aria-labelledby="results-title">
            <div className="marketplace-heading">
              <div>
                <span className="section-kicker">YOUR NEXT OPPORTUNITY</span>
                <h2 id="results-title">Explore open jobs</h2>
                <p>Thoughtful projects from clients, with scope and budget up front.</p>
              </div>
              <div className="results-tools">
                <label className="sort-control"><span>Sort by</span><select aria-label="Sort jobs" value={filters.sort} onChange={(event) => applyFilters({ ...filters, sort: event.target.value })}><option value="newest">Most recent</option><option value="budget-low" disabled={!/^[A-Z]{3}$/.test(filters.currency)}>Budget: low to high</option><option value="budget-high" disabled={!/^[A-Z]{3}$/.test(filters.currency)}>Budget: high to low</option></select></label>
                <button className="filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="job-filters" onClick={() => setFiltersOpen((open) => !open)}><MaterialIcon name="tune" />Filters{activeFilterCount > 0 && <span>{activeFilterCount}</span>}</button>
              </div>
            </div>

            <div className="marketplace-layout">
              <FilterSidebar filters={filters} onChange={applyFilters} savedCount={savedJobs.length} isOpen={filtersOpen} />
              <div className="feed-column">
                <div className="feed-heading"><p aria-live="polite" aria-atomic="true">{isLoading ? 'Updating listings…' : `${total.toLocaleString()} ${total === 1 ? 'listing' : 'listings'}`}{hasSearchOrFilters && !isLoading ? ' matching your criteria' : ''}</p>{hasSearchOrFilters && <button className="text-button" type="button" onClick={clearFilters}>Clear search & filters</button>}</div>
                <JobResults jobs={jobs} isLoading={!validationError && isLoading} error={validationError ? { title: 'Check your filters', message: validationError } : error} hasSearched={hasSearchOrFilters} onRetry={() => setRequestVersion((version) => version + 1)} onViewDetails={setSelectedJobId} savedJobs={savedJobs} onToggleSaved={toggleSaved} />
                {!validationError && !isLoading && !error && pages > 1 && <nav className="pagination" aria-label="Job listing pages"><button className="button button-secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}><MaterialIcon name="arrow_back" />Previous</button><span>Page <strong>{page}</strong> of <strong>{pages}</strong></span><button className="button button-secondary" type="button" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>Next<MaterialIcon name="arrow_forward" /></button></nav>}
              </div>
            </div>
          </section>

          <section className="how-it-works glass-surface" id="how-it-works" aria-labelledby="how-title">
            <div className="how-heading"><span className="section-kicker">A CLEAR PLACE TO START</span><h2 id="how-title">Find the right project for you.</h2><p>Every listing gives you the basics to decide whether it fits.</p></div>
            <div className="how-steps">
              <article className="glass-surface"><div className="step-topline"><span className="step-icon"><MaterialIcon name="search" /></span><span className="step-number">01</span></div><h3>Explore listings</h3><p>Search open projects by the skills and terms that matter to you.</p></article>
              <article className="glass-surface"><div className="step-topline"><span className="step-icon"><MaterialIcon name="description" /></span><span className="step-number">02</span></div><h3>Review the scope</h3><p>Open a listing to read its full description, budget, and required skills.</p></article>
              <article className="glass-surface"><div className="step-topline"><span className="step-icon"><MaterialIcon name="bookmark_add" /></span><span className="step-number">03</span></div><h3>Save what stands out</h3><p>Bookmark interesting projects in this browser for your next visit.</p></article>
            </div>
          </section>
        </div>
      </main>
      <footer className="site-footer"><div className="footer-inner"><a className="brand footer-brand" href="#top"><span className="brand-mark" aria-hidden="true"><MaterialIcon name="north_east" /></span><span>Freelancer<span className="brand-accent">Hub</span></span></a><p>Student-friendly freelance marketplace preview</p><a href="#top">Back to top <MaterialIcon name="arrow_upward" /></a></div></footer>
      {selectedJobId && <JobDetailsDialog jobId={selectedJobId} user={user} onClose={closeJobDetails} />}
    </div>
  )
}
