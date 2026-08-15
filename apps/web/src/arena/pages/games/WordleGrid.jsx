import { WORDLE_CATEGORIES, ERA_DEFINITIONS, STYLE_TAG_DEFINITIONS } from "../../utils/wordleScoring.js";
import InfoTooltip from "../../components/InfoTooltip.jsx";

// Wordle feedback tiles: these three carry game meaning (exact / close /
// wrong), so they keep a genuine three-way colour split rather than
// collapsing into the UI accent. Fills are the darker palette steps so the
// label can sit in paper and stay legible — ink-on-basketball was only
// ~3:1 after the light-theme inversion.
const TILE_COLOR = {
  green: "bg-stat-up text-paper",
  yellow: "bg-basketball-dim text-paper",
  red: "bg-ink/10 text-ink/60",
};

function Arrow({ direction }) {
  if (!direction) return null;
  return <span className="block text-xs leading-none">{direction === "up" ? "▲" : "▼"}</span>;
}

function CategoryHeader({ category }) {
  return (
    <div className="flex items-center justify-center text-center text-[11px] font-semibold uppercase tracking-wide text-ink/70">
      {category.label}
      {category.key === "era" && <InfoTooltip title="Era" items={ERA_DEFINITIONS} />}
      {category.key === "styleTag" && <InfoTooltip title="Style Tag" items={STYLE_TAG_DEFINITIONS} />}
    </div>
  );
}

function Tile({ tile }) {
  return (
    <div
      className={`flex h-20 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-center font-semibold ${TILE_COLOR[tile.color]}`}
    >
      <span className="text-sm leading-tight">{tile.value}</span>
      {tile.sublabel && <span className="text-[10px] font-normal opacity-80">{tile.sublabel}</span>}
      <Arrow direction={tile.arrow} />
    </div>
  );
}

export default function WordleGrid({ guesses, maxGuesses }) {
  const emptyRows = Math.max(0, maxGuesses - guesses.length);

  return (
    <div className="space-y-2 overflow-x-auto">
      <div className="grid grid-cols-8 gap-2" style={{ minWidth: "640px" }}>
        {WORDLE_CATEGORIES.map((c) => (
          <CategoryHeader key={c.key} category={c} />
        ))}
      </div>
      {guesses.map((g, i) => (
        <div key={i} className="space-y-1" style={{ minWidth: "640px" }}>
          <p className="text-sm font-medium text-ink">{g.player.name}</p>
          <div className="grid grid-cols-8 gap-2">
            {WORDLE_CATEGORIES.map((c) => (
              <Tile key={c.key} tile={g.feedback[c.key]} />
            ))}
          </div>
        </div>
      ))}
      {Array.from({ length: emptyRows }).map((_, i) => (
        <div key={`empty-${i}`} className="grid grid-cols-8 gap-2" style={{ minWidth: "640px" }}>
          {WORDLE_CATEGORIES.map((c) => (
            <div key={c.key} className="h-20 rounded-md border border-ink/15 bg-paper" />
          ))}
        </div>
      ))}
    </div>
  );
}
