import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../lib/api.js'
import './SkillProof.css'

const statusCopy = {
  claimed: 'Claimed · You have listed this skill, but have not submitted evidence.',
  evidence_submitted: 'Evidence submitted · An administrator has not completed the review yet.',
  reviewed: 'Reviewed · This is not a verified badge.',
  verified: 'Verified · A reviewer approved the evidence submitted for this skill. It is not a guarantee of future performance.',
  rejected: 'Not verified · Review the feedback and resubmit evidence if you wish.',
}
const typeLabel = { github: 'GitHub repository', live_demo: 'Live demo', portfolio: 'Portfolio', written_explanation: 'Written explanation' }
const displayStatus = (record) => record.status === 'reviewed' && record.reviewDecision === 'more_info' ? 'More information requested' : record.status.replaceAll('_', ' ')
const messageFor = (error) => error.response?.data?.message || 'The request did not complete. Check the API and try again.'
const normalize = (value) => value.normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ')

function ProofCard({ title, action, children, id }) {
  return <section id={id} className="surface-card glass-surface workspace-card skillproof-card"><div className="workspace-card-heading"><h2>{title}</h2>{action}</div>{children}</section>
}

function StatusBadge({ record }) {
  return <span className={`status-chip ${record.status}`} title={statusCopy[record.status]}>{displayStatus(record)}</span>
}

function EvidenceLink({ url, children }) {
  if (!url) return null
  return <a className="skillproof-evidence-link" href={url} target="_blank" rel="noopener noreferrer">{children} ↗</a>
}

export function FreelancerSkillProof({ user }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [skillName, setSkillName] = useState('')
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState('')
  const reload = useCallback(async () => {
    const { data } = await api.get('/skillproof/mine')
    setRecords(data.data)
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => { reload().catch((e) => setError(messageFor(e))).finally(() => setLoading(false)) }, 0)
    return () => window.clearTimeout(timer)
  }, [reload])

  const existingKeys = useMemo(() => new Set(records.map((record) => record.skillKey)), [records])
  const legacySkills = (user.profile?.skills || []).filter((skill) => !existingKeys.has(normalize(skill)))
  async function addSkill(name = skillName) {
    setError(''); setSuccess(''); setBusy('claim')
    try {
      await api.post('/skillproof/mine', { skillName: name })
      setSkillName(''); await reload(); setSuccess(`“${name.trim()}” added as a skill claim.`)
    } catch (e) { setError(messageFor(e)) } finally { setBusy('') }
  }
  async function submitEvidence(record) {
    const draft = drafts[record._id] || { type: 'github', url: '', description: '' }
    setError(''); setSuccess(''); setBusy(record._id)
    try {
      await api.post(`/skillproof/${record._id}/evidence`, draft)
      await reload(); setSuccess(`Evidence for ${record.skillName} was submitted for review.`)
    } catch (e) { setError(messageFor(e)) } finally { setBusy('') }
  }
  async function withdraw(record) {
    setError(''); setSuccess(''); setBusy(record._id)
    try { await api.post(`/skillproof/${record._id}/withdraw`); await reload(); setSuccess('The pending submission was withdrawn.') }
    catch (e) { setError(messageFor(e)) } finally { setBusy('') }
  }
  function updateDraft(id, key, value) {
    setDrafts((current) => ({ ...current, [id]: { type: 'github', url: '', description: '', ...current[id], [key]: value } }))
  }

  return <ProofCard id="freelancer-skillproof" title="SkillProof · evidence-backed skills">
    <p className="skillproof-intro">Add practical examples for skills on your profile. A verified badge means an administrator reviewed the submitted evidence; it does not guarantee performance on future projects.</p>
    <div className="skillproof-alerts">{error && <p className="workspace-alert error" role="alert">{error}</p>}{success && <p className="workspace-alert success" role="status">{success}</p>}</div>
    <form className="skillproof-add-form" onSubmit={(event) => { event.preventDefault(); addSkill() }}>
      <label>Claim a skill<input value={skillName} onChange={(event) => setSkillName(event.target.value)} minLength="2" maxLength="60" placeholder="e.g. React, UX design, C++" required /></label>
      <button className="button button-primary compact" disabled={busy === 'claim'}>{busy === 'claim' ? 'Adding…' : 'Add skill'}</button>
    </form>
    {legacySkills.length > 0 && <div className="skillproof-legacy"><h3>Existing profile skills</h3><p>These are self-declared on your profile. Add a SkillProof claim to submit evidence.</p><div className="skillproof-legacy-list">{legacySkills.map((skill) => <button key={normalize(skill)} className="skillproof-legacy-chip" disabled={busy === 'claim'} onClick={() => addSkill(skill)}>{skill}<span> Add proof +</span></button>)}</div></div>}
    {loading ? <p className="workspace-empty" role="status">Loading your SkillProof records…</p> : records.length ? <div className="skillproof-records">{records.map((record) => {
      const draft = drafts[record._id] || { type: 'github', url: '', description: '' }
      const canSubmit = ['claimed', 'rejected', 'reviewed'].includes(record.status)
      const previousEvidence = record.evidenceHistory || []
      return <article className="skillproof-record" key={record._id}>
        <div className="skillproof-record-title"><div><h3>{record.skillName}</h3><p className="skillproof-status-help">{statusCopy[record.status]}</p></div><StatusBadge record={record} /></div>
        {record.status === 'verified' && <p className="skillproof-verified-note"><strong>SkillProof verified:</strong> evidence for {record.skillName} was reviewed. This is evidence-specific, not a performance guarantee.</p>}
        {record.reviewFeedback && <div className="skillproof-feedback"><strong>Reviewer feedback</strong><p>{record.reviewFeedback}</p>{record.reviewer?.name && <small>Reviewed by {record.reviewer.name}{record.reviewedAt ? ` · ${new Date(record.reviewedAt).toLocaleDateString()}` : ''}</small>}</div>}
        {previousEvidence.length > 0 && <details className="skillproof-history"><summary>Evidence and submission history ({previousEvidence.length})</summary><ol>{previousEvidence.map((item) => <li key={item._id}><strong>{typeLabel[item.type]}</strong><span>{new Date(item.submittedAt).toLocaleString()}</span><p>{item.description}</p>{item.url && <EvidenceLink url={item.url}>Open submitted evidence</EvidenceLink>}</li>)}</ol></details>}
        {record.reviewHistory?.length > 0 && <details className="skillproof-history"><summary>Review history ({record.reviewHistory.length})</summary><ol>{record.reviewHistory.map((event) => <li key={event._id}><strong>{event.decision.replaceAll('_', ' ')}</strong><span>{new Date(event.decidedAt).toLocaleString()}</span><p>{event.reason}</p>{event.reviewer?.name && <small>Reviewer: {event.reviewer.name}</small>}</li>)}</ol></details>}
        {record.withdrawalHistory?.length > 0 && <details className="skillproof-history"><summary>Withdrawn submissions ({record.withdrawalHistory.length})</summary><ol>{record.withdrawalHistory.map((event) => <li key={event._id}><strong>Evidence withdrawn</strong><span>{new Date(event.withdrawnAt).toLocaleString()}</span></li>)}</ol></details>}
        {canSubmit && <form className="skillproof-evidence-form" onSubmit={(event) => { event.preventDefault(); submitEvidence(record) }}>
          <h4>{previousEvidence.length ? 'Submit revised evidence' : 'Submit evidence'}</h4>
          <div className="skillproof-form-grid"><label>Evidence category<select value={draft.type} onChange={(event) => updateDraft(record._id, 'type', event.target.value)}>{Object.entries(typeLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            {draft.type !== 'written_explanation' && <label>Evidence URL<input type="url" required value={draft.url} onChange={(event) => updateDraft(record._id, 'url', event.target.value)} placeholder="https://…" maxLength="2048" /></label>}
            {draft.type === 'written_explanation' && <label>Optional evidence URL<input type="url" value={draft.url} onChange={(event) => updateDraft(record._id, 'url', event.target.value)} placeholder="https://…" maxLength="2048" /></label>}
            <label className="skillproof-wide">What does this evidence demonstrate?<textarea required minLength="20" maxLength="2000" rows="3" value={draft.description} onChange={(event) => updateDraft(record._id, 'description', event.target.value)} placeholder="Describe your contribution and the parts that demonstrate this skill." /></label>
          </div><button className="button button-primary compact" disabled={busy === record._id}>{busy === record._id ? 'Submitting…' : previousEvidence.length ? 'Resubmit evidence' : 'Submit for review'}</button>
        </form>}
        {record.status === 'evidence_submitted' && <button className="text-button skillproof-withdraw" disabled={busy === record._id} onClick={() => withdraw(record)}>{busy === record._id ? 'Withdrawing…' : 'Withdraw pending evidence'}</button>}
      </article>
    })}</div> : <p className="workspace-empty">No SkillProof records yet. Add a claim above or start from one of your existing profile skills.</p>}
    <p className="auth-demo-note">Evidence is stored as a URL and written explanation. File uploads are not enabled for this project.</p>
  </ProofCard>
}

export function AdminSkillProof() {
  const [records, setRecords] = useState([])
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState('evidence_submitted')
  const [skill, setSkill] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/skillproof/admin', { params: { status, skill: skill.trim() || undefined, from: from || undefined, to: to || undefined, page, limit: 20 } })
      setRecords(data.data); setPages(Math.max(data.pagination.pages, 1)); setError('')
    } catch (e) { setError(messageFor(e)) } finally { setLoading(false) }
  }, [status, skill, from, to, page])
  useEffect(() => { const timer = window.setTimeout(load, 150); return () => window.clearTimeout(timer) }, [load])
  async function openRecord(record) {
    setError(''); setSuccess('')
    try { const { data } = await api.get(`/skillproof/admin/${record._id}`); setSelected(data.data); setReason('') }
    catch (e) { setError(messageFor(e)) }
  }
  async function decide(decision) {
    if (!selected) return
    setError(''); setSuccess(''); setBusy(true)
    try {
      await api.patch(`/skillproof/admin/${selected._id}/review`, { decision, reason })
      setSuccess(decision === 'approve' ? 'Evidence approved and skill verified.' : decision === 'reject' ? 'Evidence rejected with feedback.' : 'More information requested from the freelancer.')
      setSelected(null); setReason(''); await load()
    } catch (e) { setError(messageFor(e)) } finally { setBusy(false) }
  }
  async function flag() {
    if (!selected) return
    setError(''); setSuccess(''); setBusy(true)
    try { await api.patch(`/skillproof/admin/${selected._id}/flag`, { reason }); setSuccess('Review flag recorded for follow-up. It is not a finding of misconduct.'); setSelected(null); setReason(''); await load() }
    catch (e) { setError(messageFor(e)) } finally { setBusy(false) }
  }
  return <ProofCard id="admin-skillproof" title="SkillProof review queue">
    {error && <p className="workspace-alert error" role="alert">{error}</p>}{success && <p className="workspace-alert success" role="status">{success}</p>}
    <div className="skillproof-filters"><label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>{['evidence_submitted', 'claimed', 'reviewed', 'verified', 'rejected'].map((item) => <option value={item} key={item}>{item.replaceAll('_', ' ')}</option>)}</select></label><label>Skill<input value={skill} onChange={(event) => { setSkill(event.target.value); setPage(1) }} maxLength="60" placeholder="Exact skill name" /></label><label>Submitted from<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1) }} /></label><label>Submitted to<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1) }} /></label></div>
    {loading ? <p className="workspace-empty" role="status">Loading SkillProof queue…</p> : records.length ? <div className="skillproof-records">{records.map((record) => <article className="skillproof-admin-row" key={record._id}><div><div className="skillproof-record-title"><div><h3>{record.skillName}</h3><p>{record.user?.name || 'Freelancer'} · {record.user?.profile?.headline || 'No headline'} · {record.submittedAt ? new Date(record.submittedAt).toLocaleDateString() : 'Not submitted'}</p></div><StatusBadge record={record} /></div>{record.flagReason && <p className="skillproof-flag-note">Flag for review: {record.flagReason}</p>}</div><button className="button button-primary compact" onClick={() => openRecord(record)}>Review evidence</button></article>)}</div> : <p className="workspace-empty">No records match these filters.</p>}
    {pages > 1 && <div className="skillproof-pagination"><button className="text-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="text-button" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
    {selected && <div className="skillproof-review-detail" role="dialog" aria-modal="true" aria-labelledby="skillproof-review-title"><div className="skillproof-review-panel surface-card glass-surface"><div className="workspace-card-heading"><h2 id="skillproof-review-title">Review · {selected.skillName}</h2><button className="text-button" onClick={() => setSelected(null)}>Close</button></div>
      <StatusBadge record={selected} />
      <div className="skillproof-profile-summary"><strong>{selected.user?.name || 'Freelancer'}</strong><span>{selected.user?.profile?.headline || 'No profile headline'}</span><span>{selected.user?.profile?.location || 'Location not provided'}</span><p>{selected.user?.profile?.bio || 'No profile bio.'}</p><small>Profile skills: {(selected.user?.profile?.skills || []).join(', ') || 'None listed'}</small></div>
      <h3>Submitted evidence</h3>{selected.evidenceHistory?.map((item) => <article className="skillproof-evidence-item" key={item._id}><strong>{typeLabel[item.type]}</strong><time>{new Date(item.submittedAt).toLocaleString()}</time><p>{item.description}</p><EvidenceLink url={item.url}>Open evidence in a new tab</EvidenceLink></article>)}
      {selected.reviewHistory?.length > 0 && <details className="skillproof-history"><summary>Previous review decisions ({selected.reviewHistory.length})</summary><ol>{selected.reviewHistory.map((event) => <li key={event._id}><strong>{event.decision.replaceAll('_', ' ')}</strong><span>{event.reviewer?.name || 'Administrator'} · {new Date(event.decidedAt).toLocaleString()}</span><p>{event.reason}</p></li>)}</ol></details>}
      {selected.withdrawalHistory?.length > 0 && <details className="skillproof-history"><summary>Withdrawn submissions ({selected.withdrawalHistory.length})</summary><ol>{selected.withdrawalHistory.map((event) => <li key={event._id}><strong>Evidence withdrawn</strong><span>{new Date(event.withdrawnAt).toLocaleString()}</span></li>)}</ol></details>}
      {selected.status === 'evidence_submitted' ? <><label className="skillproof-review-reason">Decision feedback / flag reason<textarea minLength="5" maxLength="1000" rows="3" required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the decision or what needs follow-up." /></label><div className="skillproof-review-actions"><button className="button button-primary compact" disabled={busy || reason.trim().length < 5} onClick={() => decide('approve')}>Approve and verify</button><button className="button button-secondary compact" disabled={busy || reason.trim().length < 5} onClick={() => decide('more_info')}>Request more info</button><button className="text-button danger-link" disabled={busy || reason.trim().length < 5} onClick={() => decide('reject')}>Reject</button><button className="text-button" disabled={busy || reason.trim().length < 5} onClick={flag}>Flag for follow-up</button></div></> : <p className="auth-demo-note">This record is not pending review. Previous decisions remain in its review history.</p>}
    </div></div>}
  </ProofCard>
}
