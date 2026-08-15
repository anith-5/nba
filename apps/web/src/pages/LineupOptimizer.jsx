import { useState, useEffect } from "react";
import { api } from "../api.js";

// Diverging scale: elite lineups read green, poor ones red, with the middle
// three steps staying neutral ink. The legacy version pointed both ends at
// the same brand red (bright red for elite, plain red for poor), so the two
// extremes were only told apart by lightness — worth fixing rather than
// carrying across, since a net rating of +12 and one of -12 now actually
// look different.
const RATING_COLOR = (v) =>
  v > 8 ? "text-stat-up" : v > 3 ? "text-ink" : v > -3 ? "text-ink/70" : v > -8 ? "text-ink/60" : "text-stat-down";

const TIER_STYLE = {
  Elite:         "bg-stat-up/15 text-stat-up border-stat-up/40",
  Strong:        "bg-ink/10 text-ink border-ink/20",
  Average:       "bg-ink/5 text-ink/70 border-ink/10",
  "Below Average": "bg-ink/[0.04] text-ink/60 border-ink/10",
  Poor:          "bg-stat-down/10 text-stat-down border-stat-down/30",
};

const ARCH_COLOR = {
  "Primary Scorer":  "bg-ink/10 text-ink border-ink/15",
  "Playmaker":       "bg-ink/10 text-ink border-ink/15",
  "3-and-D Wing":    "bg-ink/10 text-ink border-ink/15",
  "Interior Big":    "bg-ink/10 text-ink border-ink/15",
  "Two-Way Wing":    "bg-ink/10 text-ink border-ink/15",
  "Role Player":     "bg-ink/5 text-ink/70 border-ink/10",
};

function ArchBadge({ arch }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${ARCH_COLOR[arch] ?? ARCH_COLOR["Role Player"]}`}>
      {arch}
    </span>
  );
}

// ── Real lineups tab ──────────────────────────────────────────────────────────

function LineupCard({ lineup, rank }) {
  return (
    <div className="hoop-card-outline p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink/60 font-mono">#{rank}</span>
        <div className="flex gap-4 text-right">
          <div><p className="text-xs text-ink/50">NET</p>
            <p className={`font-mono font-bold text-lg ${RATING_COLOR(lineup.net_rating)}`}>
              {lineup.net_rating > 0 ? "+" : ""}{lineup.net_rating}
            </p>
          </div>
          <div><p className="text-xs text-ink/50">OFF</p><p className="font-mono text-sm text-ink">{lineup.off_rating}</p></div>
          <div><p className="text-xs text-ink/50">DEF</p><p className="font-mono text-sm text-ink">{lineup.def_rating}</p></div>
        </div>
      </div>
      <div className="space-y-1">
        {lineup.players.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-terracotta flex-shrink-0" />
            <span className="text-sm text-ink">{p}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-ink/50 font-mono">{lineup.minutes} MIN · {lineup.w}W-{lineup.l}L ({lineup.gp} GP)</p>
    </div>
  );
}

function RealLineups({ teams }) {
  const [teamId, setTeamId] = useState("");
  const [result, setResult] = useState(null);
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    if (!teamId) return;
    setLoading(true); setError(null); setResult(null); setRoster(null);
    try {
      const [lineups, ros] = await Promise.all([
        api.lineupsByTeam(Number(teamId)),
        api.lineupRoster(Number(teamId)),
      ]);
      setResult(lineups);
      setRoster(ros);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div className="hoop-card-outline max-w-lg p-5 flex gap-4 items-end">
        <label className="flex-1 block text-sm">
          <span className="hoop-stat-label">Select team</span>
          <select value={teamId} onChange={e => setTeamId(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-ink bg-paper shadow-hoop-sm px-3 py-2 text-ink">
            <option value="">Choose a team…</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <button onClick={load} disabled={!teamId || loading} className="hoop-btn-primary">
          {loading ? "Loading…" : "Analyze"}
        </button>
      </div>

      {error && <p className="text-stat-down">{error}</p>}

      {roster && (
        <div className="hoop-card-outline p-4 max-w-2xl">
          <p className="hoop-stat-label mb-3">Current Roster — {roster.team_name} ({roster.season})</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {roster.players.map(p => (
              <div key={p.player_id} className="flex items-center gap-2 text-sm">
                <span className="text-ink/50 font-mono w-5 text-right text-xs">{p.number}</span>
                <div>
                  <p className="text-ink">{p.name}</p>
                  <p className="text-xs text-ink/50">{p.position} · {p.height}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-3 animate-slide-up">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-ink">{result.team_name} — Best Lineups</h2>
            <span className="text-xs text-ink/50 bg-ink/5 px-2 py-0.5 rounded">
              {result.total_lineups_analyzed} lineups · min 15 min · per 100 poss
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.lineups.map((l, i) => <LineupCard key={i} lineup={l} rank={i + 1} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hypothetical lineup tab ───────────────────────────────────────────────────

function PlayerSlot({ player, onRemove, index }) {
  if (!player) {
    return (
      <div className="hoop-card-outline p-3 border-dashed border-ink/20 flex items-center gap-2 text-ink/50 text-sm">
        <span className="h-6 w-6 rounded-full border border-ink/20 flex items-center justify-center text-xs">
          {index + 1}
        </span>
        Empty slot — search a player below
      </div>
    );
  }
  return (
    <div className="hoop-card-outline p-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="h-6 w-6 rounded-full bg-terracotta/20 text-terracotta flex items-center justify-center text-xs font-bold">
          {index + 1}
        </span>
        <div>
          <p className="text-sm font-medium text-ink">{player.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-ink/60">{player.team}</span>
            {player.archetype && <ArchBadge arch={player.archetype} />}
          </div>
        </div>
      </div>
      <button onClick={onRemove} className="text-ink/50 hover:text-stat-down text-lg leading-none">×</button>
    </div>
  );
}

function PredictionResult({ result }) {
  const tierStyle = TIER_STYLE[result.tier] ?? TIER_STYLE["Average"];
  return (
    <div className="space-y-4 animate-slide-up">
      {/* Main result */}
      <div className="hoop-card-outline p-5 text-center space-y-2">
        <p className="hoop-stat-label">Predicted Net Rating (per 100 poss)</p>
        <p className={`text-6xl font-bold font-mono ${RATING_COLOR(result.predicted_net_rating)}`}>
          {result.predicted_net_rating > 0 ? "+" : ""}{result.predicted_net_rating}
        </p>
        <div className="flex justify-center">
          <span className={`px-3 py-1 rounded-full border text-sm font-medium ${tierStyle}`}>
            {result.tier} Lineup
          </span>
        </div>
        <p className="text-xs text-ink/50">
          Model trained on {result.model_info.training_samples} real lineups · CV RMSE ±{result.model_info.cv_rmse} pts
        </p>
      </div>

      {/* Player archetypes */}
      <div className="hoop-card-outline p-4 space-y-3">
        <p className="hoop-stat-label">Player Archetypes & Fit</p>
        <div className="space-y-2">
          {result.players.map(p => (
            <div key={p.player_id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className="text-ink font-medium">{p.name}</span>
                <ArchBadge arch={p.archetype} />
              </div>
              <div className="flex gap-3 font-mono text-xs text-ink/60">
                <span>{p.pts} PPG</span>
                <span>{p.ast} APG</span>
                <span>{(p.fg3_pct * 100).toFixed(0)}% 3P</span>
              </div>
            </div>
          ))}
        </div>

        {/* Archetype balance */}
        <div className="flex gap-3 pt-2 border-t border-ink/15 text-xs flex-wrap">
          <span className={result.archetype_balance.has_primary_playmaker ? "text-stat-up" : "text-stat-down"}>
            {result.archetype_balance.has_primary_playmaker ? "✓" : "✗"} Playmaker
          </span>
          <span className={result.archetype_balance.has_interior_presence ? "text-terracotta" : "text-terracotta"}>
            {result.archetype_balance.has_interior_presence ? "✓" : "✗"} Interior Big
          </span>
          <span className={result.archetype_balance.has_floor_spacing ? "text-terracotta" : "text-terracotta"}>
            {result.archetype_balance.has_floor_spacing ? "✓" : "✗"} Floor Spacing
          </span>
        </div>
      </div>

      {/* Strengths / weaknesses */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="hoop-card-outline p-4 space-y-2">
          <p className="hoop-stat-label text-terracotta">Strengths</p>
          {result.strengths.length === 0
            ? <p className="text-ink/60 text-sm">No standout strengths detected.</p>
            : result.strengths.map((s, i) => (
                <p key={i} className="text-sm text-ink flex items-start gap-2">
                  <span className="text-terracotta mt-0.5 flex-shrink-0">✓</span>{s}
                </p>
              ))
          }
        </div>
        <div className="hoop-card-outline p-4 space-y-2">
          <p className="hoop-stat-label text-stat-down">Weaknesses</p>
          {result.weaknesses.length === 0
            ? <p className="text-ink/60 text-sm">No major weaknesses detected.</p>
            : result.weaknesses.map((w, i) => (
                <p key={i} className="text-sm text-ink/70 flex items-start gap-2">
                  <span className="text-stat-down mt-0.5 flex-shrink-0">⚠</span>{w}
                </p>
              ))
          }
        </div>
      </div>
    </div>
  );
}

function HypotheticalBuilder() {
  const [modelStatus, setModelStatus] = useState({ is_trained: false, is_training: false });
  const [training, setTraining] = useState(false);
  const [lineup, setLineup] = useState([null, null, null, null, null]);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [prediction, setPrediction] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.lineupModelStatus().then(setModelStatus).catch(() => {});
  }, []);

  async function trainModel() {
    setTraining(true); setError(null);
    try {
      await api.lineupModelTrain();
      setModelStatus({ is_trained: true });
    } catch (e) { setError(e.message); }
    finally { setTraining(false); }
  }

  async function doSearch(q) {
    setSearchQ(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const data = await api.lineupPlayerSearch(q);
      setSearchResults(data.slice(0, 8));
    } catch {}
  }

  function addPlayer(p) {
    const firstEmpty = lineup.findIndex(s => s === null);
    if (firstEmpty === -1) return;
    const archetype = modelStatus.is_trained ? undefined : undefined;
    const newLineup = [...lineup];
    newLineup[firstEmpty] = { player_id: p.id, name: p.full_name || p.name, team: p.team, archetype };
    setLineup(newLineup);
    setSearchQ(""); setSearchResults([]);
    setPrediction(null);
  }

  function removePlayer(i) {
    const newLineup = [...lineup];
    newLineup[i] = null;
    setLineup(newLineup);
    setPrediction(null);
  }

  async function predict() {
    const ids = lineup.filter(Boolean).map(p => p.player_id);
    if (ids.length !== 5) return;
    setPredicting(true); setError(null); setPrediction(null);
    try {
      const result = await api.lineupPredict(ids);
      // Merge archetype info back into lineup display
      const newLineup = lineup.map((slot, i) => {
        if (!slot) return null;
        const info = result.players.find(p => p.player_id === slot.player_id);
        return info ? { ...slot, archetype: info.archetype } : slot;
      });
      setLineup(newLineup);
      setPrediction(result);
    } catch (e) { setError(e.message); }
    finally { setPredicting(false); }
  }

  const filledCount = lineup.filter(Boolean).length;

  return (
    <div className="space-y-5">
      {/* Model status */}
      {!modelStatus.is_trained && (
        <div className="hoop-card-outline max-w-2xl p-5 space-y-3">
          <div>
            <p className="font-semibold text-ink">XGBoost Model Not Trained</p>
            <p className="text-ink/70 text-sm mt-1">
              Trains on all {new Date().getFullYear()} NBA 5-man lineups. Learns which playstyle
              combinations (scorer + playmaker, 3&D + big, etc.) produce the best net ratings.
              Takes ~60–90s.
            </p>
          </div>
          <button onClick={trainModel} disabled={training} className="hoop-btn-primary">
            {training ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Fetching lineup data & training XGBoost…
              </span>
            ) : "Train Lineup Model"}
          </button>
          {error && <p className="text-stat-down text-sm">{error}</p>}
        </div>
      )}

      {modelStatus.is_trained && (
        <div className="flex items-center gap-2 text-sm text-terracotta">
          <span className="h-2 w-2 rounded-full bg-terracotta" />
          XGBoost model ready · {modelStatus.training_samples} training lineups · CV RMSE ±{modelStatus.cv_rmse} pts
          <span className="text-ink/50 ml-2">Player search reflects current trades</span>
        </div>
      )}

      {/* Lineup builder */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="hoop-stat-label">Build Your Lineup ({filledCount}/5)</p>
          {lineup.map((p, i) => (
            <PlayerSlot key={i} player={p} index={i} onRemove={() => removePlayer(i)} />
          ))}

          {filledCount < 5 && (
            <div className="relative">
              <input
                type="text"
                value={searchQ}
                onChange={e => doSearch(e.target.value)}
                placeholder={modelStatus.is_trained
                  ? "Search any NBA player (live data — shows current team)…"
                  : "Train model first for live player data…"}
                disabled={!modelStatus.is_trained}
                className="w-full rounded-xl border-2 border-ink bg-paper shadow-hoop-sm px-3 py-2 text-ink text-sm disabled:opacity-40"
              />
              {searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-xl border-2 border-ink bg-paper shadow-hoop-sm divide-y divide-ink/15">
                  {searchResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addPlayer(p)}
                      className="w-full px-3 py-2 text-left hover:bg-ink/5 flex items-center justify-between"
                    >
                      <span className="text-sm text-ink">{p.full_name || p.name}</span>
                      <span className="text-xs text-ink/60">{p.team}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={predict}
            disabled={filledCount !== 5 || predicting || !modelStatus.is_trained}
            className="hoop-btn-primary w-full justify-center"
          >
            {predicting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                Predicting…
              </span>
            ) : filledCount === 5 ? "Predict Lineup Net Rating" : `Add ${5 - filledCount} more player${5 - filledCount !== 1 ? "s" : ""}`}
          </button>

          {error && <p className="text-stat-down text-sm">{error}</p>}

          <div className="hoop-card-outline p-3 text-xs text-ink/50 space-y-1">
            <p><span className="text-ink/70">How it works:</span></p>
            <p>1. All 2025-26 5-man lineups fetched from NBA API</p>
            <p>2. Players clustered into 6 archetypes via KMeans</p>
            <p>3. XGBoost predicts net rating from player stats + archetype mix</p>
            <p>4. Works for any 5 players — even ones who've never played together</p>
          </div>
        </div>

        <div>
          {prediction
            ? <PredictionResult result={prediction} />
            : (
              <div className="hoop-card-outline p-8 text-center text-ink/50 h-full flex items-center justify-center">
                <div className="space-y-2">
                  <p className="text-4xl">🏀</p>
                  <p>Build a 5-man lineup to see the predicted net rating</p>
                </div>
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LineupOptimizer() {
  const [teams, setTeams] = useState([]);
  const [tab, setTab] = useState("real");

  useEffect(() => {
    api.lineupTeams().then(setTeams).catch(() => {});
  }, []);

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-ink">Lineup Optimizer</h1>
        <p className="mt-1 text-ink/70">
          Real 5-man lineup data from NBA API + XGBoost hypothetical lineup predictor.
        </p>
      </header>

      <div className="flex gap-1 p-1 rounded-xl border-2 border-ink bg-ink/5 w-fit">
        {[["real", "📊 Real Lineups"], ["hypo", "🔮 Hypothetical Builder"]].map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              tab === v ? "bg-ink text-paper" : "text-ink/70 hover:text-ink"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "real"  && <RealLineups teams={teams} />}
      {tab === "hypo"  && <HypotheticalBuilder />}
    </div>
  );
}
