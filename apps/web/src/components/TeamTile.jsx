// Colored abbreviation tiles stand in for trademarked logos.
// Primary hex per team; text auto-picks black/white for contrast.
export const TEAM_COLORS = {
  ATL: "#E03A3E", BOS: "#007A33", BKN: "#000000", CHA: "#1D1160", CHI: "#CE1141",
  CLE: "#860038", DAL: "#00538C", DEN: "#0E2240", DET: "#C8102E", GSW: "#1D428A",
  HOU: "#CE1141", IND: "#002D62", LAC: "#C8102E", LAL: "#552583", MEM: "#5D76A9",
  MIA: "#98002E", MIL: "#00471B", MIN: "#0C2340", NOP: "#0C2340", NYK: "#006BB6",
  OKC: "#007AC1", ORL: "#0077C0", PHI: "#006BB6", PHX: "#1D1160", POR: "#E03A3E",
  SAC: "#5A2D81", SAS: "#8A8D8F", TOR: "#CE1141", UTA: "#002B5C", WAS: "#002B5C",
};

// Relative-luminance check → readable text color on any tile
function textOn(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0F172A" : "#F8FAFC";
}

const SIZES = {
  sm: "h-9 w-9 text-xs rounded-lg",
  md: "h-12 w-12 text-sm rounded-xl",
  lg: "h-16 w-16 text-lg rounded-2xl",
};

export function TeamTile({ tricode, size = "md", className = "" }) {
  const code = (tricode || "?").toUpperCase();
  const bg = TEAM_COLORS[code] || "#334155";
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center font-display font-extrabold tracking-tight ring-1 ring-white/10 ${SIZES[size]} ${className}`}
      style={{ backgroundColor: bg, color: textOn(bg) }}
    >
      {code}
    </span>
  );
}

// Player headshot placeholder — initials on a deterministic navy/blue tile
export function InitialsTile({ name = "", size = "lg", className = "" }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden="true"
      className={`flex items-center justify-center bg-gradient-to-br from-brand-dim to-surface-raised font-display font-bold text-white ring-1 ring-white/10 ${SIZES[size]} ${className}`}
    >
      {initials || "?"}
    </span>
  );
}
