// Simple line-icon-style motifs per game mode, one visual idea each --
// matches the hoop/basketball line-stroke treatment (stroke="currentColor",
// no fill) so each one inherits whatever text color its card context is
// using (paper on a filled .hoop-card, ink on a .hoop-card-outline).
const ICON_PROPS = {
  viewBox: "0 0 32 32",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const ICONS = {
  "over-under": (
    // Up/down double arrow -- the over/under line itself.
    <svg {...ICON_PROPS}>
      <path d="M16 3v26M16 3l-6 6M16 3l6 6M16 29l-6-6M16 29l6-6" />
    </svg>
  ),
  "hint-auction": (
    // Gavel: angled hammer head + handle + sound block.
    <svg {...ICON_PROPS}>
      <path d="M8 14l7-7 5 5-7 7z" />
      <path d="M12 12l8 8" />
      <path d="M17 17l6 6" />
      <path d="M6 27h11" />
    </svg>
  ),
  "82-0": (
    // Trophy: undefeated-season motif.
    <svg {...ICON_PROPS}>
      <path d="M11 6h10v7a5 5 0 01-10 0z" />
      <path d="M11 8H7a3 3 0 003 5" />
      <path d="M21 8h4a3 3 0 01-3 5" />
      <path d="M16 18v4" />
      <path d="M11 27h10" />
      <path d="M13 22h6l1 5H12z" />
    </svg>
  ),
  "build-a-player": (
    // Player silhouette with a plus badge -- "assemble" motif.
    <svg {...ICON_PROPS}>
      <circle cx="14" cy="10" r="5" />
      <path d="M5 27c0-6 4-9 9-9" />
      <circle cx="23" cy="21" r="6" />
      <path d="M23 18v6M20 21h6" />
    </svg>
  ),
  wordle: (
    // Letter-tile grid -- one tile "correct."
    <svg {...ICON_PROPS}>
      <rect x="4" y="4" width="8" height="8" rx="1.5" />
      <rect x="14" y="4" width="8" height="8" rx="1.5" fill="currentColor" fillOpacity="0.35" />
      <rect x="24" y="4" width="4" height="8" rx="1.5" />
      <rect x="4" y="14" width="8" height="8" rx="1.5" />
      <rect x="14" y="14" width="8" height="8" rx="1.5" />
    </svg>
  ),
  "closest-to": (
    // Bullseye target.
    <svg {...ICON_PROPS}>
      <circle cx="16" cy="16" r="11" />
      <circle cx="16" cy="16" r="6" />
      <circle cx="16" cy="16" r="1.4" fill="currentColor" />
    </svg>
  ),
  "five-hints": (
    // Spotlight cone revealing a question mark.
    <svg {...ICON_PROPS}>
      <path d="M13 4h6l3 9H10z" />
      <path d="M14.2 17.5a1.8 1.8 0 013.6 0c0 1.8-1.8 1.8-1.8 3.6" />
      <circle cx="16" cy="25" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ),
  draft: (
    // Clipboard with a roster list -- the draft board.
    <svg {...ICON_PROPS}>
      <rect x="7" y="6" width="18" height="23" rx="2" />
      <rect x="12" y="3" width="8" height="5" rx="1.5" />
      <path d="M11 14h10M11 18h10M11 22h6" />
    </svg>
  ),
  trade: (
    // Two opposing arrows -- an exchange.
    <svg {...ICON_PROPS}>
      <path d="M6 12h18M20 8l4 4-4 4" />
      <path d="M26 20H8M12 16l-4 4 4 4" />
    </svg>
  ),
};

export default function GameModeIcon({ modeId, className = "" }) {
  const icon = ICONS[modeId];
  if (!icon) return null;
  return <span className={className}>{icon}</span>;
}
