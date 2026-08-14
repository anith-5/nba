// Shared basketball glyph -- used by the homepage nav-ball arc and the Arena
// carousel's icon-only side-card view, so both keep the same look.
export default function BasketballIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 60 60" aria-hidden="true" className={className}>
      <circle cx="30" cy="30" r="28" className="fill-basketball" />
      <path
        d="M2 30h56M30 2v56M9 9c14 11 14 40 0 51M51 9c-14 11-14 40 0 51"
        stroke="#8A3D15"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}
