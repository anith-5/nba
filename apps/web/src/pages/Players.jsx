import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { InitialsTile, TeamTile } from "../components/TeamTile.jsx";
import ShareButton from "../components/ShareCard.jsx";

function StatTile({ label, value, suffix = "", accent }) {
  return (
    <div className="rounded-xl border-2 border-ink/15 bg-paper-raised px-3 py-3 text-center">
      <p className={`font-hoop text-xl font-bold tabular-nums ${accent ? "text-terracotta" : "text-ink"}`}>
        {value}
        {suffix}
      </p>
      <p className="hoop-stat-label mt-0.5">{label}</p>
    </div>
  );
}

// ---- AI quick-actions: jump into a tool with this player pre-loaded ----
function QuickAction({ to, title, sub, icon }) {
  const paths = {
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
    bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />,
    trend: <path d="M3 17l6-6 4 4 8-8M15 3h6v6" />,
    doc: <><path d="M6 2h9l5 5v15H6z" /><path d="M15 2v5h5M9 13h6M9 17h6" /></>,
  };
  return (
    <Link to={to} className="hoop-card-outline-hover group flex items-center gap-3 p-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-terracotta/15 text-terracotta ring-1 ring-terracotta/20">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          {paths[icon]}
        </svg>
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1 font-hoop text-sm font-semibold text-ink">
          {title}
          <span className="text-terracotta transition-transform group-hover:translate-x-0.5">→</span>
        </p>
        <p className="truncate text-xs text-ink/60">{sub}</p>
      </div>
    </Link>
  );
}

function PlayerProfile({ profile }) {
  const info = profile.info;
  const c = profile.career_totals;
  const name = info.DISPLAY_FIRST_LAST;
  const id = profile.player_id;
  const tri = info.TEAM_ABBREVIATION;
  const q = `?player=${id}&name=${encodeURIComponent(name)}`;

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Header */}
      <div className="hoop-card-outline flex flex-wrap items-center gap-4 p-5">
        <InitialsTile name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="font-hoop text-2xl font-extrabold tracking-tight text-ink">{name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/70">
            {tri && <TeamTile tricode={tri} size="sm" className="!h-6 !w-6 !text-[10px]" />}
            <span>{info.TEAM_NAME || "Free Agent"}</span>
            <span className="text-ink/50">·</span>
            <span>{info.POSITION || "—"}</span>
            <span className="text-ink/50">·</span>
            <span>{info.HEIGHT || "—"}</span>
            {info.WEIGHT && (
              <>
                <span className="text-ink/50">·</span>
                <span>{info.WEIGHT} lbs</span>
              </>
            )}
          </div>
        </div>
        {c && (
          <ShareButton
            eyebrow="Career Averages"
            title={name}
            subtitle={`${info.TEAM_NAME || "NBA"} · ${info.POSITION || ""}`.trim()}
            bigValue={c.ppg}
            bigLabel="Career PPG"
            rows={[
              { label: "RPG", value: c.rpg },
              { label: "APG", value: c.apg },
              { label: "TS%", value: `${(c.ts_pct * 100).toFixed(1)}%` },
            ]}
          />
        )}
      </div>

      {/* AI quick-actions */}
      <div>
        <p className="hoop-stat-label mb-2">AI tools · pre-loaded for {name.split(" ").slice(-1)[0]}</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction to={`/shot-quality${q}`} icon="target" title="Shot Quality" sub="Hot-zone xFG% map" />
          <QuickAction to={`/clutch${q}`} icon="bolt" title="Clutch DNA" sub="Elevation score + tier" />
          <QuickAction to={`/trajectory${q}`} icon="trend" title="Development" sub="Comps & projections" />
          <QuickAction to={`/scouting${q}`} icon="doc" title="AI Scouting" sub="Claude report · PDF" />
        </div>
      </div>

      {/* Career averages */}
      {c && (
        <div className="hoop-card-outline p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="hoop-stat-label">Career Averages</p>
            <span className="text-xs text-ink/60">{c.gp} games played</span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            <StatTile label="PPG" value={c.ppg} />
            <StatTile label="RPG" value={c.rpg} />
            <StatTile label="APG" value={c.apg} />
            <StatTile label="SPG" value={c.spg} />
            <StatTile label="BPG" value={c.bpg} />
            <StatTile label="FG%" value={(c.fg_pct * 100).toFixed(1)} />
            <StatTile label="3P%" value={(c.fg3_pct * 100).toFixed(1)} />
            <StatTile label="TS%" value={(c.ts_pct * 100).toFixed(1)} accent />
          </div>
        </div>
      )}

      {/* Season-by-season */}
      {profile.seasons?.length > 0 && (
        <div className="hoop-card-outline p-5">
          <p className="hoop-stat-label mb-3">
            Season-by-Season ({profile.seasons.length} season{profile.seasons.length !== 1 ? "s" : ""})
          </p>
          <div className="max-h-[520px] overflow-auto rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-paper-raised shadow-[0_2px_0_0_rgba(36,49,196,0.15)]">
                <tr className="text-terracotta">
                  {["Season", "Team", "Age", "GP", "MIN", "PPG", "RPG", "APG", "SPG", "BPG", "FG%", "3P%", "FT%", "TS%"].map((h) => (
                    <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profile.seasons.map((s, i) => (
                  <tr key={`${s.season}-${i}`} className="border-t border-ink/5 text-ink hover:bg-ink/5">
                    <td className="py-1.5 pr-3 font-mono">{s.season}</td>
                    <td className="py-1.5 pr-3">{s.team}</td>
                    <td className="py-1.5 pr-3 font-mono">{s.age}</td>
                    <td className="py-1.5 pr-3 font-mono">{s.gp}</td>
                    <td className="py-1.5 pr-3 font-mono">{s.min_pg}</td>
                    <td className="py-1.5 pr-3 font-mono font-semibold text-ink">{s.ppg}</td>
                    <td className="py-1.5 pr-3 font-mono">{s.rpg}</td>
                    <td className="py-1.5 pr-3 font-mono">{s.apg}</td>
                    <td className="py-1.5 pr-3 font-mono">{s.spg}</td>
                    <td className="py-1.5 pr-3 font-mono">{s.bpg}</td>
                    <td className="py-1.5 pr-3 font-mono">{(s.fg_pct * 100).toFixed(1)}%</td>
                    <td className="py-1.5 pr-3 font-mono">{(s.fg3_pct * 100).toFixed(1)}%</td>
                    <td className="py-1.5 pr-3 font-mono">{(s.ft_pct * 100).toFixed(1)}%</td>
                    <td className="py-1.5 font-mono">{(s.ts_pct * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Players() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const boxRef = useRef(null);

  // Live autocomplete (debounced)
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const data = await api.searchPlayers(query);
        setResults((data.players ?? []).slice(0, 8));
        setOpen(true);
      } catch (err) {
        setError(err.message);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function loadProfile(p) {
    setOpen(false);
    setQuery(p.full_name);
    setLoading(true);
    setError(null);
    try {
      const data = await api.playerProfile(p.id);
      setProfile(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">Player Search</h1>
        <p className="mt-1 text-ink/70">Search any player, then jump straight into the AI tools.</p>
      </header>

      {/* Prominent search with live autocomplete */}
      <div ref={boxRef} className="relative max-w-2xl">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/60"
          fill="none" stroke="currentColor" strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search a player… (e.g. Nikola Jokić)"
          aria-label="Search player"
          className="w-full rounded-card border border-ink/10 bg-paper-raised/70 py-3.5 pl-12 pr-4 text-ink placeholder:text-ink/60 focus:border-terracotta focus:outline-none"
        />
        {open && results.length > 0 && (
          <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-card border border-ink/10 bg-paper-raised/95 shadow-card ">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => loadProfile(p)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-ink/5"
                >
                  <InitialsTile name={p.full_name} size="sm" />
                  <span className="text-sm text-ink">{p.full_name}</span>
                  {!p.is_active && <span className="ml-auto text-xs text-ink/60">retired</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-terracotta/50 bg-terracotta/30 px-4 py-3 text-sm text-stat-down">{error}</p>
      )}

      {loading && (
        <div className="hoop-card-outline h-40 animate-pulse bg-paper-raised/40" />
      )}

      {!loading && !profile && !error && (
        <div className="hoop-card-outline p-10 text-center text-ink/60">
          Search for a player to view their profile and AI breakdowns.
        </div>
      )}

      {!loading && profile?.info && <PlayerProfile profile={profile} />}
    </div>
  );
}
