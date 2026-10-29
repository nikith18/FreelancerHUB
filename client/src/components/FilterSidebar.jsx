import MaterialIcon from './MaterialIcon.jsx'

export default function FilterSidebar({ filters, onChange, savedCount, isOpen }) {
  function updateFilter(event) {
    const { name, value, type, checked } = event.target
    onChange({ ...filters, [name]: type === 'checkbox' ? checked : name === 'currency' ? value.toUpperCase() : value })
  }

  return (
    <aside className={`filter-column${isOpen ? ' is-open' : ''}`} id="job-filters" aria-label="Filter job listings">
      <section className="filter-panel glass-surface">
        <div className="filter-heading">
          <div><span className="section-kicker">REFINE YOUR SEARCH</span><h2><MaterialIcon name="tune" />Filters</h2></div>
          <button className="text-button" type="button" onClick={() => onChange({ jobType: '', currency: '', minBudget: '', maxBudget: '', sort: 'newest' })}>Reset filters</button>
        </div>

        <fieldset className="filter-group">
          <legend>Engagement type</legend>
          <label className="field-label" htmlFor="job-type">How would you like to work?</label>
          <select id="job-type" name="jobType" value={filters.jobType} onChange={updateFilter}>
            <option value="">Any type</option>
            <option value="fixed">Fixed price</option>
            <option value="hourly">Hourly</option>
          </select>
        </fieldset>

        <fieldset className="filter-group">
          <legend>Budget</legend>
          <label className="field-label" htmlFor="currency-filter">Currency code (for example, USD)</label>
          <input className="currency-input" id="currency-filter" name="currency" type="text" autoComplete="off" autoCapitalize="characters" maxLength="3" pattern="[A-Za-z]{3}" placeholder="Any currency" value={filters.currency} onChange={updateFilter} aria-invalid={Boolean(filters.currency && !/^[A-Z]{3}$/.test(filters.currency))} />
          <p className="filter-help">Enter a 3-letter currency code before setting a budget range.</p>
          <div className="budget-fields">
            <label><span className="visually-hidden">Minimum budget</span><input name="minBudget" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Min" value={filters.minBudget} onChange={updateFilter} disabled={!/^[A-Z]{3}$/.test(filters.currency)} /></label>
            <span className="budget-separator" aria-hidden="true">to</span>
            <label><span className="visually-hidden">Maximum budget</span><input name="maxBudget" type="number" min="0" step="0.01" inputMode="decimal" placeholder="Max" value={filters.maxBudget} onChange={updateFilter} disabled={!/^[A-Z]{3}$/.test(filters.currency)} /></label>
          </div>
        </fieldset>

        <div className="saved-summary"><MaterialIcon name="bookmark" /><span><strong>{savedCount}</strong> {savedCount === 1 ? 'listing saved' : 'listings saved'} in this browser</span></div>

        <p className="filter-note"><MaterialIcon name="info" />Filters apply to current open listings.</p>
      </section>
    </aside>
  )
}
