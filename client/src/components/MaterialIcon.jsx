/**
 * @typedef {Readonly<{ name: string; className?: string }>} MaterialIconProps
 */

/** @param {MaterialIconProps} props */
export default function MaterialIcon({ name, className = '' }) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden="true">
      {name}
    </span>
  )
}
