import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../lib/api.js'
import { useAuth } from '../auth/auth-context.js'
import { AdminSkillProof, FreelancerSkillProof } from './SkillProof.jsx'
import './Workspace.css'

const roleName = { client: 'Client', freelancer: 'Freelancer', admin: 'Administrator' }
const messageFor = (error) => error.response?.data?.message || 'The request did not complete. Check the API and try again.'

function Card({ title, action, children, className = '', id }) {
  return <section id={id} className={`surface-card glass-surface workspace-card ${className}`}><div className="workspace-card-heading"><h2>{title}</h2>{action}</div>{children}</section>
}

function Stat({ label, value, detail }) {
  return <article className="surface-card glass-surface workspace-stat"><span>{label}</span><strong>{value ?? '—'}</strong><small>{detail}</small></article>
}

function Notice({ error, success }) {
  return <>{error && <p className="workspace-alert error" role="alert">{error}</p>}{success && <p className="workspace-alert success" role="status">{success}</p>}</>
}

function NotificationList() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  useEffect(() => { api.get('/notifications').then(({ data }) => setItems(data.data)).catch((e) => setError(messageFor(e))) }, [])
  async function markRead(id) {
    try { await api.patch(`/notifications/${id}/read`); setItems((all) => all.map((item) => item._id === id ? { ...item, read: true } : item)) } catch (e) { setError(messageFor(e)) }
  }
  return <Card title="Recent notifications"><Notice error={error} />{items.length ? <ul className="notification-list">{items.map((item) => <li key={item._id} className={item.read ? '' : 'unread'}><div><strong>{item.type.replaceAll('_', ' ')}</strong><p>{item.message}</p><time>{new Date(item.createdAt).toLocaleString()}</time></div>{!item.read && <button className="text-button" onClick={() => markRead(item._id)}>Mark read</button>}</li>)}</ul> : <p className="workspace-empty">You are all caught up. Updates will show here when something needs your attention.</p>}</Card>
}

function ProfileEditor({ user, onSaved, id }) {
  const [name, setName] = useState(user.name)
  const [headline, setHeadline] = useState(user.profile?.headline || '')
  const [bio, setBio] = useState(user.profile?.bio || '')
  const [location, setLocation] = useState(user.profile?.location || '')
  const [skills, setSkills] = useState((user.profile?.skills || []).join(', '))
  const [portfolio, setPortfolio] = useState((user.profile?.portfolio || []).join('\n'))
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('')
    try {
      const { data } = await api.put('/profile/me', { name, profile: { headline, bio, location, skills: skills.split(',').map((x) => x.trim()).filter(Boolean), portfolio: portfolio.split('\n').map((x) => x.trim()).filter(Boolean) } })
      onSaved(data.data); setSuccess('Your profile has been saved.')
    } catch (e) { setError(messageFor(e)) } finally { setBusy(false) }
  }
  return <Card id={id} title="Your profile"><Notice error={error} success={success} /><form className="workspace-form" onSubmit={submit}><label>Display name<input value={name} maxLength="80" onChange={(e) => setName(e.target.value)} required /></label><label>Headline<input value={headline} maxLength="120" placeholder="e.g. Frontend developer" onChange={(e) => setHeadline(e.target.value)} /></label><label>Location<input value={location} maxLength="100" placeholder="City or region" onChange={(e) => setLocation(e.target.value)} /></label>{user.role === 'freelancer' && <label>Skills, separated by commas<input value={skills} placeholder="React, Figma, Writing" onChange={(e) => setSkills(e.target.value)} /></label>}<label className="wide-field">About you<textarea value={bio} rows="4" maxLength="2000" onChange={(e) => setBio(e.target.value)} placeholder="A short introduction" /></label>{user.role === 'freelancer' && <label className="wide-field">Portfolio links, one per line<textarea value={portfolio} rows="3" onChange={(e) => setPortfolio(e.target.value)} placeholder="https://your-portfolio.example" /></label>}<button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></form></Card>
}

function ClientWorkspace() {
  const [jobs, setJobs] = useState([])
  const [projects, setProjects] = useState([])
  const [reviewNotes, setReviewNotes] = useState({})
  const [applications, setApplications] = useState([])
  const [selectedJob, setSelectedJob] = useState('')
  const [editingJob, setEditingJob] = useState('')
  const [editDraft, setEditDraft] = useState({ title: '', description: '', budget: '', category: '', skills: '' })
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [skills, setSkills] = useState('')
  const [budget, setBudget] = useState('')
  const [category, setCategory] = useState('')
  const [deadline, setDeadline] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(async () => {
    const [jobsResponse, projectsResponse] = await Promise.all([api.get('/jobs/mine'), api.get('/projects/my')])
    setJobs(jobsResponse.data.data)
    setProjects(projectsResponse.data.data)
  }, [])
  const loadApplications = useCallback(async (jobId) => {
    setSelectedJob(jobId)
    try { const { data } = await api.get(`/applications/job/${jobId}`); setApplications(data.data); setError('') } catch (e) { setError(messageFor(e)) }
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => refresh().catch((e) => setError(messageFor(e))), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])
  async function createJob(event) {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('')
    try {
      await api.post('/jobs', { title, description, requiredSkills: skills.split(',').map((x) => x.trim()).filter(Boolean), budget: Number(budget), currency: 'USD', category, deadline: deadline || null })
      setTitle(''); setDescription(''); setSkills(''); setBudget(''); setCategory(''); setDeadline(''); await refresh(); setSuccess('Your job is now open for proposals.')
    } catch (e) { setError(messageFor(e)) } finally { setBusy(false) }
  }
  async function changeStatus(job, status) {
    setError(''); setSuccess('')
    try { await api.put(`/jobs/${job._id}`, { status }); await refresh(); setSuccess(status === 'open' ? 'Job reopened.' : 'Job closed.') } catch (e) { setError(messageFor(e)) }
  }
  function beginEdit(job) {
    setEditingJob(job._id)
    setEditDraft({ title: job.title, description: job.description, budget: String(job.budget), category: job.category || '', skills: (job.requiredSkills || []).join(', ') })
  }
  async function saveEdit(event, job) {
    event.preventDefault(); setError(''); setSuccess('')
    try {
      await api.put(`/jobs/${job._id}`, { title: editDraft.title, description: editDraft.description, budget: Number(editDraft.budget), category: editDraft.category, requiredSkills: editDraft.skills.split(',').map((x) => x.trim()).filter(Boolean) })
      setEditingJob(''); await refresh(); setSuccess('Your job details have been updated.')
    } catch (e) { setError(messageFor(e)) }
  }
  async function review(application, action) {
    setError(''); setSuccess('')
    try { await api.post(`/applications/${application._id}/${action}`); await loadApplications(selectedJob); await refresh(); setSuccess(action === 'accept' ? 'Proposal accepted and a project was created.' : 'Proposal declined.') } catch (e) { setError(messageFor(e)) }
  }
  async function reviewProject(project, decision) {
    setError(''); setSuccess('')
    try {
      await api.post(`/projects/${project._id}/review`, { decision, note: reviewNotes[project._id] || '' })
      setReviewNotes((current) => ({ ...current, [project._id]: '' })); await refresh()
      setSuccess(decision === 'approve' ? 'Work approved and marked complete.' : 'Revision request sent to the freelancer.')
    } catch (e) { setError(messageFor(e)) }
  }
  return <>
    <div className="workspace-stats" id="dashboard-overview"><Stat label="Jobs posted" value={jobs.length} detail="Your listings" /><Stat label="Open" value={jobs.filter((x) => x.status === 'open').length} detail="Accepting proposals" /><Stat label="Active projects" value={projects.filter((x) => ['active', 'submitted', 'revision_requested'].includes(x.status)).length} detail="In progress and review" /><Stat label="Completed" value={projects.filter((x) => x.status === 'completed').length} detail="Approved work" /></div>
    <Notice error={error} success={success} />
    <div className="workspace-columns"><Card id="post-job" title="Post a job"><form className="workspace-form" onSubmit={createJob}><label>Job title<input minLength="5" maxLength="120" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you need help with?" /></label><label>Budget in USD<input type="number" min="1" max="100000000" step="0.01" required value={budget} onChange={(e) => setBudget(e.target.value)} /></label><label>Category<input maxLength="60" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Design, development…" /></label><label>Target deadline<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label><label className="wide-field">Description<textarea minLength="20" maxLength="5000" required rows="5" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the scope and what a successful result looks like." /></label><label className="wide-field">Required skills, separated by commas<input value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="React, UX design" /></label><button className="button button-primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish job'}</button></form></Card>
      <Card id="client-jobs" title="Your job listings">{jobs.length ? <div className="workspace-list">{jobs.map((job) => <article key={job._id} className="workspace-row"><div className="job-row-main">{editingJob === job._id ? <form className="job-edit-form" onSubmit={(event) => saveEdit(event, job)}><label>Title<input required minLength="5" maxLength="120" value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} /></label><label>Description<textarea required minLength="20" maxLength="5000" rows="4" value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} /></label><div className="proposal-form-row"><label>Budget<input type="number" required min="1" step="0.01" value={editDraft.budget} onChange={(e) => setEditDraft({ ...editDraft, budget: e.target.value })} /></label><label>Category<input maxLength="60" value={editDraft.category} onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value })} /></label></div><label>Skills<input value={editDraft.skills} onChange={(e) => setEditDraft({ ...editDraft, skills: e.target.value })} /></label><div className="row-actions"><button className="button button-primary compact">Save changes</button><button className="text-button" type="button" onClick={() => setEditingJob('')}>Cancel</button></div></form> : <><h3>{job.title}</h3><p>${job.budget?.toLocaleString()} USD · {job.category || 'General'} · <span className={`status-chip ${job.status}`}>{job.status}</span></p></>}</div><div className="row-actions"><button className="text-button" onClick={() => loadApplications(job._id)}>Proposals</button>{job.status !== 'removed' && <button className="text-button" onClick={() => beginEdit(job)}>Edit</button>}{job.status === 'open' && <button className="text-button" onClick={() => changeStatus(job, 'closed')}>Close</button>}{job.status === 'closed' && <button className="text-button" onClick={() => changeStatus(job, 'open')}>Reopen</button>}</div></article>)}</div> : <p className="workspace-empty">You have not posted a job yet. Use the form to get started.</p>}</Card></div>
    {selectedJob && <Card id="client-applications" title={`Proposals · ${jobs.find((x) => x._id === selectedJob)?.title || ''}`} action={<button className="text-button" onClick={() => setSelectedJob('')}>Close</button>}>{applications.length ? <div className="workspace-list">{applications.map((app) => <article className="proposal-row" key={app._id}><div><h3>{app.freelancer?.name} <span className={`status-chip ${app.status}`}>{app.status}</span></h3><p>{app.freelancer?.profile?.headline || 'Freelancer'} · {app.duration} · ${app.proposedBudget?.toLocaleString()}</p><p>{app.message}</p>{app.freelancer?.profile?.skills?.length > 0 && <p>Skills: {app.freelancer.profile.skills.join(', ')}</p>}{app.freelancer?.verifiedSkills?.length > 0 && <div className="skillproof-public-badges" aria-label="SkillProof verified skills"><strong>SkillProof verified evidence</strong>{app.freelancer.verifiedSkills.map((skill) => <span className="skillproof-public-badge" key={skill.skillName} title={`Reviewer approved ${skill.evidenceType?.replaceAll('_', ' ')} evidence for ${skill.skillName}. This is not a performance guarantee.`}>✓ {skill.skillName}<small>{skill.evidenceType?.replaceAll('_', ' ')}</small></span>)}</div>}</div>{app.status === 'pending' && <div className="row-actions"><button className="button button-primary compact" onClick={() => review(app, 'accept')}>Accept</button><button className="text-button" onClick={() => review(app, 'reject')}>Decline</button></div>}</article>)}</div> : <p className="workspace-empty">No proposals yet. We’ll show incoming proposals here.</p>}</Card>}
    <Card id="client-projects" title="Project tracking">{projects.length ? <div className="workspace-list">{projects.map((project) => <article className="proposal-row" key={project._id}><div><h3>{project.job?.title} <span className={`status-chip ${project.status}`}>{project.status.replaceAll('_', ' ')}</span></h3><p>Freelancer: {project.freelancer?.name} · Payment status: {project.paymentStatus.replaceAll('_', ' ')}</p>{project.submission && <p>Submission: {project.submission}</p>}{project.reviewNote && <p>Your last note: {project.reviewNote}</p>}</div>{project.status === 'submitted' && <div className="submission-box"><textarea rows="2" maxLength="2000" placeholder="Optional note for revision" value={reviewNotes[project._id] || ''} onChange={(e) => setReviewNotes((current) => ({ ...current, [project._id]: e.target.value }))} /><div className="row-actions"><button className="button button-primary compact" onClick={() => reviewProject(project, 'approve')}>Approve work</button><button className="text-button" onClick={() => reviewProject(project, 'revision')}>Request revision</button></div></div>}</article>)}</div> : <p className="workspace-empty">An accepted proposal starts a project. Active work and review status will appear here.</p>}<p className="auth-demo-note">Payment status is tracking only. FreelancerHub does not process payments.</p></Card>
    <NotificationList />
  </>
}

function FreelancerWorkspace({ user, onProfileSaved }) {
  const [applications, setApplications] = useState([])
  const [projects, setProjects] = useState([])
  const [error, setError] = useState('')
  const [submission, setSubmission] = useState({})
  const [busyId, setBusyId] = useState('')
  const refresh = useCallback(async () => {
    const [apps, works] = await Promise.all([api.get('/applications/my'), api.get('/projects/my')])
    setApplications(apps.data.data); setProjects(works.data.data)
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => refresh().catch((e) => setError(messageFor(e))), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])
  async function submitWork(project) {
    setBusyId(project._id); setError('')
    try { await api.post(`/projects/${project._id}/submit`, { submission: submission[project._id] }); setSubmission((current) => ({ ...current, [project._id]: '' })); await refresh() } catch (e) { setError(messageFor(e)) } finally { setBusyId('') }
  }
  return <>
    <div className="workspace-stats" id="dashboard-overview"><Stat label="Proposals" value={applications.length} detail="Submitted" /><Stat label="Awaiting review" value={applications.filter((x) => x.status === 'pending').length} detail="Pending proposals" /><Stat label="Active projects" value={projects.filter((x) => ['active', 'revision_requested', 'submitted'].includes(x.status)).length} detail="In progress or review" /><Stat label="Completed" value={projects.filter((x) => x.status === 'completed').length} detail="Approved work" /></div>
    <Notice error={error} />
    <div className="workspace-columns"><Card id="freelancer-applications" title="My proposals">{applications.length ? <div className="workspace-list">{applications.map((app) => <article key={app._id} className="workspace-row"><div><h3>{app.job?.title || 'Job no longer available'}</h3><p>${app.proposedBudget?.toLocaleString()} · {app.duration} · {app.job?.status === 'open' ? 'Open' : 'Job closed'}</p></div><span className={`status-chip ${app.status}`}>{app.status}</span></article>)}</div> : <p className="workspace-empty">You have not sent a proposal yet. <Link to="/">Explore open jobs</Link> to find a match.</p>}</Card>
      <Card id="freelancer-projects" title="My projects">{projects.length ? <div className="workspace-list">{projects.map((project) => <article className="proposal-row" key={project._id}><div><h3>{project.job?.title}</h3><p>Client: {project.client?.name} · Payment status: {project.paymentStatus.replaceAll('_', ' ')}</p><p className={`status-chip ${project.status}`}>{project.status.replaceAll('_', ' ')}</p>{project.reviewNote && <p>Client note: {project.reviewNote}</p>}</div>{['active', 'revision_requested'].includes(project.status) && <div className="submission-box"><textarea rows="3" minLength="10" maxLength="4000" placeholder="Describe the work you are submitting" value={submission[project._id] ?? project.submission ?? ''} onChange={(e) => setSubmission((current) => ({ ...current, [project._id]: e.target.value }))} /><button className="button button-primary compact" disabled={busyId === project._id} onClick={() => submitWork(project)}>{busyId === project._id ? 'Sending…' : 'Submit work'}</button></div>}</article>)}</div> : <p className="workspace-empty">Accepted proposals become projects here. Project payment status is tracked in the app; payments are not processed.</p>}</Card></div>
    <FreelancerSkillProof user={user} />
    <ProfileEditor id="freelancer-profile" user={user} onSaved={onProfileSaved} /><NotificationList />
  </>
}

function AdminWorkspace() {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [jobs, setJobs] = useState([])
  const [applications, setApplications] = useState([])
  const [search, setSearch] = useState('')
  const [userPage, setUserPage] = useState(1)
  const [userPages, setUserPages] = useState(1)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const refresh = useCallback(async () => {
    const [statsRes, jobsRes, applicationsRes] = await Promise.all([api.get('/admin/stats'), api.get('/admin/jobs'), api.get('/admin/applications')])
    setStats(statsRes.data.data); setJobs(jobsRes.data.data); setApplications(applicationsRes.data.data)
  }, [])
  const loadUsers = useCallback(async () => {
    const { data } = await api.get('/admin/users', { params: { page: userPage, limit: 20, search: search.trim() || undefined } })
    setUsers(data.data); setUserPages(Math.max(1, data.pagination.pages))
  }, [search, userPage])
  useEffect(() => {
    const timer = window.setTimeout(() => refresh().catch((e) => setError(messageFor(e))), 0)
    return () => window.clearTimeout(timer)
  }, [refresh])
  useEffect(() => {
    const timer = window.setTimeout(() => loadUsers().catch((e) => setError(messageFor(e))), 200)
    return () => window.clearTimeout(timer)
  }, [loadUsers])
  async function updateUser(id, updates) {
    const action = updates.status === 'suspended' ? 'Suspend this account? The person will no longer be able to sign in.' : 'Reactivate this account?'
    if (!window.confirm(action)) return
    setError(''); setSuccess('')
    try { await api.patch(`/admin/users/${id}`, updates); await refresh(); await loadUsers(); setSuccess('Account updated.') } catch (e) { setError(messageFor(e)) }
  }
  async function moderateJob(job, status) {
    if (status === 'removed' && !window.confirm(`Remove “${job.title}” from public job search? The listing will be hidden but retained for review.`)) return
    setError(''); setSuccess('')
    try { await api.patch(`/admin/jobs/${job._id}`, { status }); await refresh(); setSuccess(`Job marked ${status}.`) } catch (e) { setError(messageFor(e)) }
  }
  async function moderateApplication(application) {
    if (!window.confirm('Withdraw this pending proposal from the marketplace?')) return
    try { await api.patch(`/admin/applications/${application._id}`, { status: 'withdrawn' }); await refresh(); setSuccess('Proposal withdrawn after moderation.') } catch (e) { setError(messageFor(e)) }
  }
  return <>
    <div className="workspace-stats admin-stats" id="dashboard-overview">{[['Users', 'users'], ['Clients', 'clients'], ['Freelancers', 'freelancers'], ['Jobs', 'jobs'], ['Open jobs', 'openJobs'], ['Projects', 'projects']].map(([label, key]) => <Stat key={key} label={label} value={stats?.[key]} detail="Database count" />)}</div>
    <Notice error={error} success={success} />
    <Card id="admin-users" title="User management" action={<input className="table-search" type="search" placeholder="Search people" value={search} onChange={(e) => { setSearch(e.target.value); setUserPage(1) }} />}>{users.length ? <div className="table-scroll"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Account verification</th><th>Actions</th></tr></thead><tbody>{users.map((u) => <tr key={u._id}><td>{u.name}<small>{u.email}</small></td><td>{u.role}</td><td>{u.status}</td><td>{u.verificationStatus}</td><td className="row-actions">{u.status === 'active' ? <button className="text-button danger-link" onClick={() => updateUser(u._id, { status: 'suspended' })}>Suspend</button> : <button className="text-button" onClick={() => updateUser(u._id, { status: 'active' })}>Activate</button>}</td></tr>)}</tbody></table></div> : <p className="workspace-empty">No users match this search.</p>}{userPages > 1 && <div className="row-actions"><button className="text-button" disabled={userPage <= 1} onClick={() => setUserPage((page) => page - 1)}>Previous</button><span>Page {userPage} of {userPages}</span><button className="text-button" disabled={userPage >= userPages} onClick={() => setUserPage((page) => page + 1)}>Next</button></div>}</Card>
    <AdminSkillProof />
    <Card id="admin-jobs" title="Job moderation">{jobs.length ? <div className="workspace-list">{jobs.map((job) => <article className="workspace-row" key={job._id}><div><h3>{job.title}</h3><p>{job.client?.name || 'Unknown client'} · {job.status}</p></div><div className="row-actions">{job.status !== 'removed' && <button className="text-button danger-link" onClick={() => moderateJob(job, 'removed')}>Remove listing</button>}{job.status === 'closed' && <button className="text-button" onClick={() => moderateJob(job, 'open')}>Reopen</button>}</div></article>)}</div> : <p className="workspace-empty">There are no job listings to review.</p>}</Card>
    <Card id="admin-applications" title="Proposal moderation">{applications.filter((app) => app.status === 'pending').length ? <div className="workspace-list">{applications.filter((app) => app.status === 'pending').map((app) => <article className="workspace-row" key={app._id}><div><h3>{app.job?.title || 'Job unavailable'} · {app.freelancer?.name || 'Freelancer'}</h3><p>{app.message}</p></div><button className="text-button danger-link" onClick={() => moderateApplication(app)}>Withdraw proposal</button></article>)}</div> : <p className="workspace-empty">No pending proposals need moderation.</p>}</Card>
    <NotificationList />
  </>
}

const workspaceNavigation = {
  client: [
    { label: 'Overview', href: '#dashboard-overview', icon: '◫' },
    { label: 'Post a job', href: '#post-job', icon: '+' },
    { label: 'Your jobs', href: '#client-jobs', icon: '▤' },
    { label: 'Applications', href: '#client-jobs', icon: '✉' },
    { label: 'Projects', href: '#client-projects', icon: '◷' },
    { label: 'Profile', to: '/account', icon: '◉' },
  ],
  freelancer: [
    { label: 'Overview', href: '#dashboard-overview', icon: '◫' },
    { label: 'Browse jobs', to: '/', icon: '⌕' },
    { label: 'Applications', href: '#freelancer-applications', icon: '✉' },
    { label: 'Projects', href: '#freelancer-projects', icon: '◷' },
    { label: 'Profile & skills', href: '#freelancer-profile', icon: '◉' },
    { label: 'SkillProof', href: '#freelancer-skillproof', icon: '✓' },
  ],
  admin: [
    { label: 'Overview', href: '#dashboard-overview', icon: '◫' },
    { label: 'Users', href: '#admin-users', icon: '◉' },
    { label: 'Jobs', href: '#admin-jobs', icon: '▤' },
    { label: 'Applications', href: '#admin-applications', icon: '✉' },
    { label: 'SkillProof reviews', href: '#admin-skillproof', icon: '✓' },
  ],
}

export default function Workspace() {
  const { user, logout, acceptSession } = useAuth()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(() => {
    try { return window.localStorage.getItem('freelancerhub.theme') === 'dark' ? 'dark' : 'light' } catch { return 'light' }
  })
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    try { window.localStorage.setItem('freelancerhub.theme', theme) } catch { /* Theme still applies for this page session. */ }
  }, [theme])
  if (!user) return null
  function signOut() { void logout().finally(() => navigate('/')) }
  const saveProfile = (updated) => acceptSession({ user: updated })
  const links = workspaceNavigation[user.role] || workspaceNavigation.freelancer
  return <main className="workspace-page">
    <header className="workspace-header glass-surface">
      <Link className="auth-brand" to="/"><span className="auth-brand-mark">↗</span>Freelancer<span>Hub</span></Link>
      <nav aria-label="Account navigation"><Link to="/">Explore jobs</Link><Link to="/account">Profile</Link><button className="workspace-theme-toggle" type="button" onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} aria-label={'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme'}>{theme === 'dark' ? '☀ Light' : '◐ Dark'}</button><button className="text-button" onClick={signOut}>Sign out</button></nav>
    </header>
    <div className="workspace-layout">
      <aside className="workspace-sidebar glass-surface">
        <p className="workspace-sidebar-label">{roleName[user.role]} workspace</p>
        <nav aria-label="Dashboard navigation">{links.map((item) => item.to
          ? <Link className="workspace-side-link" key={item.label} to={item.to}><span className="workspace-side-icon" aria-hidden="true">{item.icon}</span>{item.label}<span className="workspace-side-arrow" aria-hidden="true">›</span></Link>
          : <a className="workspace-side-link" key={item.label} href={item.href}><span className="workspace-side-icon" aria-hidden="true">{item.icon}</span>{item.label}<span className="workspace-side-arrow" aria-hidden="true">›</span></a>)}</nav>
        {user.role !== 'freelancer' && <Link className="workspace-sidebar-footer" to="/account">Edit your profile <span aria-hidden="true">↗</span></Link>}
      </aside>
      <div className="workspace-container">
        <div className="workspace-welcome"><div><p className="workspace-eyebrow">{roleName[user.role]} WORKSPACE</p><h1>Welcome, {user.name.split(' ')[0]}.</h1><p>{user.role === 'freelancer' ? 'Keep an eye on proposals, projects, and the next opportunity.' : user.role === 'client' ? 'Bring the right people onto your next project.' : 'Review platform activity and keep the marketplace healthy.'}</p></div><span className="welcome-avatar">{user.name.slice(0, 1).toUpperCase()}</span></div>
        {user.role === 'client' ? <ClientWorkspace /> : user.role === 'freelancer' ? <FreelancerWorkspace user={user} onProfileSaved={saveProfile} /> : <AdminWorkspace />}
      </div>
    </div>
  </main>
}

export function AccountPage() {
  const { user, acceptSession, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null
  return <main className="workspace-page"><header className="workspace-header glass-surface"><Link className="auth-brand" to="/"><span className="auth-brand-mark">↗</span>Freelancer<span>Hub</span></Link><nav><Link to="/workspace">Workspace</Link><Link to="/">Explore jobs</Link><button className="text-button" onClick={() => { void logout().finally(() => navigate('/')) }}>Sign out</button></nav></header><div className="workspace-container"><div className="workspace-welcome"><div><p className="workspace-eyebrow">ACCOUNT SETTINGS</p><h1>Your profile</h1><p>Keep your information current so people know who they are working with.</p></div></div><ProfileEditor user={user} onSaved={(updated) => acceptSession({ user: updated })} /></div></main>
}
