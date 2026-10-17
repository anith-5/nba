import { useEffect, useMemo, useRef, useState } from "react";
import {
  COURT_W, COURT_H, FT, HOOP, ARC_R, CORNER_X, ARC_START_Y,
  PAINT_HALF, PAINT_DEPTH, RESTRICTED_R, dist, distToSegment,
} from "../../lib/iq/court.js";

/*
 * Top-down half court with ten players.
 *
 * Offence is ink blue, defence terracotta. That pairing is not decorative —
 * blue against orange separates at dE 34 for normal vision and still 30+ under
 * both protanopia and deuteranopia, where a red/green pairing would collapse.
 * Every player also carries a label, so identity never rests on colour alone.
 *
 * Baseline at the top, half court at the bottom — the same orientation the
 * site's shot charts use, so y means the same thing here as it does there.
 * (Flipping it to put the hoop at the bottom would also mirror every player
 * label, which is why diagrams are drawn this way.)
 *
 * Movement is CSS-transitioned rather than animated frame by frame: positions
 * are the state, the browser interpolates, and a scenario's pre-action and its
 * outcome are both just a change of coordinates.
 */

const INK = "#2431C4";
const TERRA = "#AE5236";
const PAPER = "#F2F1EA";
const LINE = "rgba(36, 49, 196, 0.26)";
const BALL = "#D8803F";
const OPEN = "#257C56";

const px = (ft) => ft * FT;

function Lines() {
  const hx = px(HOOP.x);
  const hy = px(HOOP.y);
  const arcR = px(ARC_R);
  const cornerX = px(CORNER_X);
  const arcY = px(ARC_START_Y);
  return (
    <g fill="none" stroke={LINE} strokeWidth="1.4">
      {/* sidelines + baseline + half-court line */}
      <rect x="0.7" y="0.7" width={COURT_W - 1.4} height={COURT_H - 1.4} />
      <line x1="0" y1={COURT_H - 0.7} x2={COURT_W} y2={COURT_H - 0.7} strokeWidth="2" />
      {/* centre circle at half court */}
      <path d={`M ${hx - px(6)} ${COURT_H} A ${px(6)} ${px(6)} 0 0 0 ${hx + px(6)} ${COURT_H}`} />
      {/* paint + free-throw circle */}
      <rect x={hx - px(PAINT_HALF)} y="0" width={px(PAINT_HALF * 2)} height={px(PAINT_DEPTH)} />
      <path d={`M ${hx - px(6)} ${px(PAINT_DEPTH)} A ${px(6)} ${px(6)} 0 0 0 ${hx + px(6)} ${px(PAINT_DEPTH)}`} />
      <path
        d={`M ${hx - px(6)} ${px(PAINT_DEPTH)} A ${px(6)} ${px(6)} 0 0 1 ${hx + px(6)} ${px(PAINT_DEPTH)}`}
        strokeDasharray="4 4"
      />
      {/* three-point line: corner straightaways then the arc */}
      <path
        d={`M ${hx - cornerX} 0 L ${hx - cornerX} ${arcY} A ${arcR} ${arcR} 0 0 0 ${hx + cornerX} ${arcY} L ${hx + cornerX} 0`}
        strokeWidth="1.8"
      />
      {/* restricted area + rim + backboard */}
      <path d={`M ${hx - px(RESTRICTED_R)} ${hy} A ${px(RESTRICTED_R)} ${px(RESTRICTED_R)} 0 0 0 ${hx + px(RESTRICTED_R)} ${hy}`} />
      <circle cx={hx} cy={hy} r={px(0.75)} strokeWidth="1.6" />
      <line x1={hx - px(3)} y1={px(4)} x2={hx + px(3)} y2={px(4)} strokeWidth="2" />
    </g>
  );
}

function Player({ p, side, isYou, hasBall, open, dimmed, label }) {
  const color = side === "offense" ? INK : TERRA;
  const x = px(p.spot.x);
  const y = px(p.spot.y);
  return (
    <g
      style={{
        transform: `translate(${x}px, ${y}px)`,
        transition: "transform 620ms cubic-bezier(0.33, 1, 0.68, 1)",
      }}
      opacity={dimmed ? 0.38 : 1}
    >
      {isYou && (
        <>
          <circle r="15" fill="none" stroke={color} strokeWidth="1.6" opacity="0.45">
            <animate attributeName="r" values="14;18;14" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle r="12.5" fill="none" stroke={color} strokeWidth="2" />
        </>
      )}
      {open && !isYou && (
        <circle r="12.5" fill="none" stroke={OPEN} strokeWidth="2" strokeDasharray="3 2.5" />
      )}
      <circle r="8.5" fill={color} stroke={PAPER} strokeWidth="1.6" />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="7.5"
        fontWeight="700"
        fill={PAPER}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {label}
      </text>
      {hasBall && <circle cx="9" cy="-8" r="4" fill={BALL} stroke={PAPER} strokeWidth="1.2" />}
    </g>
  );
}

export default function CourtCanvas({
  scenario,
  aids = {},
  highlightTarget = null,
  className = "",
}) {
  const offense = scenario.offense;
  const defense = scenario.defense;
  const handler = offense.find((o) => o.ball);
  const controlled =
    scenario.role === "defense" ? defense.find((d) => d.you) : offense.find((o) => o.you);

  // Who is actually open? Nearest-defender distance, computed rather than
  // authored, so the highlight can never disagree with the positions drawn.
  const openIds = useMemo(() => {
    if (!aids.showOpenTeammates) return new Set();
    const out = new Set();
    for (const o of offense) {
      if (o.ball) continue;
      let min = Infinity;
      for (const d of defense) min = Math.min(min, dist(o.spot, d.spot));
      if (min >= 4.2) out.add(o.id);
    }
    return out;
  }, [offense, defense, aids.showOpenTeammates]);

  // Passing lanes from the handler, coloured by whether a defender sits in them.
  const lanes = useMemo(() => {
    if (!aids.showLanes || !handler) return [];
    return offense
      .filter((o) => !o.ball)
      .map((o) => {
        let closest = Infinity;
        for (const d of defense) {
          const { d: gap, t } = distToSegment(d.spot, handler.spot, o.spot);
          if (t > 0.08 && t < 0.92) closest = Math.min(closest, gap);
        }
        return { id: o.id, to: o.spot, clean: closest >= 3 };
      });
  }, [offense, defense, handler, aids.showLanes]);

  const helpers = aids.showHelp
    ? new Set(defense.filter((d) => d.helping || d.note).map((d) => d.id))
    : new Set();

  return (
    <div className={`relative ${className}`}>
      <svg
        viewBox={`0 0 ${COURT_W} ${COURT_H}`}
        className="w-full rounded-hoop border-2 border-ink bg-paper"
        role="img"
        aria-label={`Half court. ${scenario.prompt}`}
      >
        <Lines />

        {lanes.map((l) => (
          <line
            key={l.id}
            x1={px(handler.spot.x)}
            y1={px(handler.spot.y)}
            x2={px(l.to.x)}
            y2={px(l.to.y)}
            stroke={l.clean ? OPEN : TERRA}
            strokeWidth="1.4"
            strokeDasharray={l.clean ? "5 3" : "2 3"}
            opacity={l.clean ? 0.75 : 0.4}
          />
        ))}

        {highlightTarget && (
          <line
            x1={px(highlightTarget.from.x)}
            y1={px(highlightTarget.from.y)}
            x2={px(highlightTarget.to.x)}
            y2={px(highlightTarget.to.y)}
            stroke={BALL}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        )}

        {/* Defence under offence so a defender never hides the man with the ball. */}
        {defense.map((d, i) => (
          <Player
            key={d.id}
            p={d}
            side="defense"
            isYou={scenario.role === "defense" && d.you}
            label={`D${i + 1}`}
            dimmed={helpers.size > 0 && !helpers.has(d.id) && !d.you}
          />
        ))}
        {offense.map((o, i) => (
          <Player
            key={o.id}
            p={o}
            side="offense"
            isYou={scenario.role !== "defense" && o.you}
            hasBall={!!o.ball}
            open={openIds.has(o.id)}
            label={`O${i + 1}`}
          />
        ))}
      </svg>

      {/* Notes sit outside the flipped SVG so the text is not mirrored. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink/60">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: INK }} />
          Offence
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TERRA }} />
          Defence
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: INK }} />
          You ({controlled ? (scenario.role === "defense" ? "defender" : "offence") : "—"})
        </span>
        {aids.showOpenTeammates && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed"
              style={{ borderColor: OPEN }}
            />
            Open
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: BALL }} />
          Ball
        </span>
      </div>
    </div>
  );
}
