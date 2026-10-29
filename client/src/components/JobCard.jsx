import MaterialIcon from './MaterialIcon.jsx'

function formatDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

export default function JobCard({ job, isSaved, onToggleSaved, onViewDetails }) {
  const skillTags = Array.isArray(job.requiredSkills) ? job.requiredSkills.slice(0, 4) : []
  const extraSkills = Math.max(0, (job.requiredSkills?.length ?? 0) - skillTags.length)
  const budget = Number(job.budget)
  const formattedBudget = Number.isFinite(budget)
    ? new Intl.NumberFormat(undefined, { style: 'currency', currency: job.currency || 'USD', maximumFractionDigits: 2 }).format(budget)
    : 'Budget not specified'

  return (
    <article className="job-card glass-surface">
      <div className="job-card-topline">
        <span className="job-type"><MaterialIcon name={job.jobType === 'hourly' ? 'schedule' : 'payments'} />{job.jobType === 'hourly' ? 'Hourly' : 'Fixed price'}</span>
        <button className={`bookmark-button${isSaved ? ' is-saved' : ''}`} type="button" aria-label={isSaved ? `Remove ${job.title} from saved listings` : `Save ${job.title}`} aria-pressed={isSaved} onClick={() => onToggleSaved(job._id)}>
          <MaterialIcon name={isSaved ? 'bookmark_added' : 'bookmark_add'} />
        </button>
      </div>
      <h3 className="job-title"><button type="button" onClick={() => onViewDetails(job._id)}>{job.title}</button></h3>
      <div className="job-meta">
        <span><MaterialIcon name="payments" />{formattedBudget}</span>
        {formatDate(job.createdAt) && <span><MaterialIcon name="calendar_today" />Posted {formatDate(job.createdAt)}</span>}
        {job.category && <span><MaterialIcon name="folder_open" />{job.category}</span>}
      </div>
      <p className="job-description">{job.description}</p>
      {skillTags.length > 0 && (
        <ul className="job-tags" aria-label="Required skills">
          {skillTags.map((skill) => <li key={skill}>{skill}</li>)}
          {extraSkills > 0 && <li className="more-skills">+{extraSkills} more</li>}
        </ul>
      )}
      <div className="job-card-footer">
        <span className="client-label"><span className="client-avatar" aria-hidden="true">C</span>Client posted a project</span>
        <button className="details-link" type="button" onClick={() => onViewDetails(job._id)}>View details <MaterialIcon name="arrow_forward" /></button>
      </div>
    </article>
  )
}
