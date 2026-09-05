import { COURT_LINE, COURT_H, COURT_W, FT, NBA_COURT } from "./ShotChart.jsx";
import { INK, SUBINK } from "../lib/compTheme.js";
import { ZONES, ZONE_LABELS, ZONE_PATHS } from "../lib/shotZones.js";

/*
 * Zone shot chart — the same court as ShotChart.jsx, but split into the ten
 * regions defined in lib/shotZones.js, each labelled with what the player shot
 * from there.
 *
 * The fill answers one question: did THIS player outshoot the other one from
 * this spot? Green yes, red no. So the two courts in a matchup mirror each
 * other, and scanning for green is scanning for where a player won.
 */

// Green/red for won/lost. Kept away from the two series colors (ink blue and
// terracotta) so a zone fill never reads as a player's identity color, and
// backed up by a ▲/▼ on every label — the verdict is never carried by hue
// alone, which is also what makes it survive a color-blind reading.
const WIN = "#2E7D52";
const LOSS = "#B23B32";
const NEUTRAL = "rgba(36,49,196,0.06)";
const CHIP = "#FBFAF6";

// Below this many attempts on either side, a zone is not called either way:
// 1-for-2 does not "beat" 40% on fifty attempts, and coloring it green would
// be the chart telling a lie about the sample it has.
const MIN_ATTEMPTS = 5;

// Full saturation at a 15-point gap. Bigger gaps than that exist but they all
// read as "decisively better" — the ramp is for telling a rout from a nudge.
const MAX_GAP = 0.15;

function verdict(mine, theirs) {
  if (!mine || !theirs) return null;
  if (mine.attempts < MIN_ATTEMPTS || theirs.attempts < MIN_ATTEMPTS) return null;
  if (mine.pct == null || theirs.pct == null) return null;
  const gap = mine.pct - theirs.pct;
  if (gap === 0) return null;
  return {
    won: gap > 0,
    fill: gap > 0 ? WIN : LOSS,
    opacity: 0.16 + 0.5 * Math.min(1, Math.abs(gap) / MAX_GAP),
  };
}

function ZoneLabel({ x, y, zone, v }) {
  const pctText = zone.pct == null ? "—" : `${(zone.pct * 100).toFixed(1)}%`;
  const mark = v ? (v.won ? "▲" : "▼") : "";
  return (
    <g>
      <rect x={x - 23} y={y - 11} width="46" height="13.5" rx="3" fill={CHIP} opacity="0.94" />
      <text x={x} y={y - 1.2} textAnchor="middle" fontSize="9" fontWeight="700" fill={INK}>
        {mark}{mark && " "}{pctText}
      </text>
      <rect x={x - 19} y={y + 3} width="38" height="11.5" rx="3" fill={CHIP} opacity="0.94" />
      <text x={x} y={y + 11.4} textAnchor="middle" fontSize="7.5" fill={SUBINK}>
        {zone.made}/{zone.attempts}
      </text>
    </g>
  );
}

/**
 * `zones` is this player's per-zone totals (lib/shotZones.js zoneTotals), and
 * `opponent` the other player's — the fills are the comparison between them.
 */
export default function ZoneShotChart({
  zones,
  opponent,
  label,
  made,
  attempts,
  color,
  court = NBA_COURT,
  className = "flex-1",
}) {
  const pct = attempts ? ((made / attempts) * 100).toFixed(0) : null;
  const hoopX = (25 / 50) * COURT_W;
  const hoopY = court.hoop * FT;
  const cornerX = court.corner * FT;
  const arcR = court.arcR * FT;
  const arcY = court.arcStart * FT;
  const paintHalf = (court.paint ?? 8) * FT;

  return (
    <div className={className}>
      {label && (
        <p className="mb-1 text-center text-xs font-semibold" style={{ color }}>
          {label}
          {attempts ? ` · ${made}/${attempts} (${pct}% FG)` : ""}
        </p>
      )}
      <svg viewBox={`0 0 ${COURT_W} ${COURT_H}`} className="w-full">
        {/* zone fills, drawn first so every court line lands on top of them */}
        {ZONES.map((z) => {
          const mine = zones?.[z.id];
          const v = verdict(mine, opponent?.[z.id]);
          return (
            <path key={z.id} d={ZONE_PATHS[z.id]} fillRule="evenodd"
              fill={v ? v.fill : NEUTRAL} fillOpacity={v ? v.opacity : 1}
              stroke={COURT_LINE} strokeWidth="0.8">
              <title>
                {`${z.label}: ${mine?.made ?? 0}/${mine?.attempts ?? 0}`}
                {mine?.pct != null ? ` (${(mine.pct * 100).toFixed(1)}%)` : ""}
              </title>
            </path>
          );
        })}

        {/* the court itself — identical markings to ShotChart.jsx */}
        <rect x="1" y="1" width={COURT_W - 2} height={COURT_H - 2} fill="none" stroke={COURT_LINE} strokeWidth="1.5" />
        <rect x={hoopX - paintHalf} y="0" width={paintHalf * 2} height={19 * FT} fill="none" stroke={COURT_LINE} strokeWidth="1.2" />
        <path d={`M ${hoopX - cornerX} 0 L ${hoopX - cornerX} ${arcY} A ${arcR} ${arcR} 0 0 0 ${hoopX + cornerX} ${arcY} L ${hoopX + cornerX} 0`}
          fill="none" stroke={COURT_LINE} strokeWidth="1.2" />
        <circle cx={hoopX} cy={hoopY} r="4" fill="none" stroke={COURT_LINE} strokeWidth="1.5" />

        {/* labels last so nothing draws over them */}
        {ZONES.map((z) => {
          const mine = zones?.[z.id];
          if (!mine) return null;
          const [lx, ly] = ZONE_LABELS[z.id];
          return <ZoneLabel key={z.id} x={lx} y={ly} zone={mine} v={verdict(mine, opponent?.[z.id])} />;
        })}
      </svg>
    </div>
  );
}
