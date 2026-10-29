import './StartupLoader.css'

export default function StartupLoader({ isLeaving }) {
  return (
    <div className={`startup-loader${isLeaving ? ' is-leaving' : ''}`} role="status" aria-live="polite" aria-label="Loading FreelancerHub">
      <div className="startup-loader-card glass-surface">
        <div className="loader-glass" aria-hidden="true">
          <span className="loader-orbit" />
          <span className="loader-liquid loader-liquid-one" />
          <span className="loader-liquid loader-liquid-two" />
          <span className="loader-highlight" />
        </div>
        <p className="loader-brand">Freelancer<span>Hub</span></p>
        <p className="loader-message">Making room for your next move<span className="loader-ellipsis" aria-hidden="true">…</span></p>
        <div className="loader-progress" aria-hidden="true"><span /></div>
      </div>
    </div>
  )
}
