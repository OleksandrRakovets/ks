/** Undo/Corrected mark shared by the Last Command Bar and the Protocol. */
export function CorrectionIcon(props: { className: string }) {
  return (
    <svg aria-hidden className={props.className} viewBox="0 0 24 24" fill="none">
      <path
        d="M5 8H2.5V3.5M3 8a9 9 0 1 1-.25 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
