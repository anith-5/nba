import { WORDLE_CATEGORIES, ERA_DEFINITIONS, STYLE_TAG_DEFINITIONS } from "../../utils/wordleScoring.js";
import InfoTooltip from "../../components/InfoTooltip.jsx";

const TILE_COLOR = {
  green: "bg-court text-slate-950",
  yellow: "bg-amber-400 text-slate-950",
  red: "bg-slate-800 text-slate-300",
};

function Arrow({ direction }) {
  if (!direction) return null;
  return <span className="block text-xs leading-none">{direction === "up" ? "▲" : "▼"}</span>;
}

function CategoryHeader({ category }) {
  return (
    <div className="flex items-center justify-center text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
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
          <p className="text-sm font-medium text-white">{g.player.name}</p>
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
            <div key={c.key} className="h-20 rounded-md border border-slate-800 bg-slate-900/40" />
          ))}
        </div>
      ))}
    </div>
  );
}
