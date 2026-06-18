import { useState, useEffect } from "react";
import { api } from "../api.js";

const RATING_COLOR = (v) =>
  v > 8 ? "text-court-glow" : v > 3 ? "text-court" : v > -3 ? "text-white" : v > -8 ? "text-orange-400" : "text-red-400";

const TIER_STYLE = {
  Elite:         "bg-court/15 text-court-glow border-court/40",
  Strong:        "bg-blue-500/10 text-blue-400 border-blue-500/30",
  Average:       "bg-slate-700/30 text-slate-300 border-slate-600/30",
  "Below Average": "bg-orange-500/10 text-orange-400 border-orange-500/30",
  Poor:          "bg-red-500/10 text-red-400 border-red-500/20",
};

const ARCH_COLOR = {
  "Primary Scorer":  "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  "Playmaker":       "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "3-and-D Wing":    "bg-court/15 text-court border-court/30",
  "Interior Big":    "bg-purple-500/15 text-purple-400 border-purple-500/30",
  "Two-Way Wing":    "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  "Role Player":     "bg-slate-700/30 text-slate-400 border-slate-600/30",
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
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500 font-mono">#{rank}</span>
        <div className="flex gap-4 text-right">
          <div><p className="text-xs text-slate-600">NET</p>
            <p className={`font-mono font-bold text-lg ${RATING_COLOR(lineup.net_rating)}`}>
              {lineup.net_rating > 0 ? "+" : ""}{lineup.net_rating}
            </p>
          </div>
          <div><p className="text-xs text-slate-600">OFF</p><p className="font-mono text-sm text-slate-300">{lineup.off_rating}</p></div>
          <div><p className="text-xs text-slate-600">DEF</p><p className="font-mono text-sm text-slate-300">{lineup.def_rating}</p></div>
        </div>
      </div>
      <div className="space-y-1">
        {lineup.players.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-court flex-shrink-0" />
            <span className="text-sm text-slate-200">{p}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-600 font-mono">{lineup.minutes} MIN · {lineup.w}W-{lineup.l}L ({lineup.gp} GP)</p>
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
      <div className="card max-w-lg p-5 flex gap-4 items-end">
        <label className="flex-1 block text-sm">
          <span className="stat-label">Select team</span>
          <select value={teamId} onChange={e => setTeamId(e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white">
            <option value="">Choose a team…</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <button onClick={load} disabled={!teamId || loading} className="btn-primary">
          {loading ? "Loading…" : "Analyze"}
        </button>
      </div>

      {error && <p className="text-amber-300">{error}</p>}

      {roster && (
        <div className="card p-4 max-w-2xl">
          <p className="stat-label mb-3">Current Roster — {roster.team_name} ({roster.season})</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {roster.players.map(p => (
              <div key={p.player_id} className="flex items-center gap-2 text-sm">
                <span className="text-slate-600 font-mono w-5 text-right text-xs">{p.number}</span>
                <div>
                  <p className="text-slate-200">{p.name}</p>
                  <p className="text-xs text-slate-600">{p.position} · {p.height}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-3 animate-slide-up">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">{result.team_name} — Best Lineups</h2>
            <span className="text-xs text-slate-600 bg-slate-800 px-2 py-0.5 rounded">
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
      <div className="card p-3 border-dashed border-slate-700 flex items-center gap-2 text-slate-600 text-sm">
        <span className="h-6 w-6 rounded-full border border-slate-700 flex items-center justify-center text-xs">
          {index + 1}
        </span>
        Empty slot — search a player below
      </div>
    );
  }
  return (
    <div className="card p-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="h-6 w-6 rounded-full bg-court/20 text-court flex items-center justify-center text-xs font-bold">
          {index + 1}
        </span>
        <div>
          <p className="text-sm font-medium text-white">{player.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-500">{player.team}</span>
            {player.archetype && <ArchBadge arch={player.archetype} />}
          </div>
        </div>
      </div>
      <button onClick={onRemove} className="text-slate-600 hover:text-red-400 text-lg leading-none">×</button>
    </div>
  );
}

function PredictionResult({ result }) {
  const tierStyle = TIER_STYLE[result.tier] ?? TIER_STYLE["Average"];
  return (
    <div className="space-y-4 animate-slide-up">
      {/* Main result */}
      <div className="card p-5 text-center space-y-2">
        <p className="stat-label">Predicted Net Rating (per 100 poss)</p>
        <p className={`text-6xl font-bold font-mono ${RATING_COLOR(result.predicted_net_rating)}`}>
          {result.predicted_net_rating > 0 ? "+" : ""}{result.predicted_net_rating}
        </p>
        <div className="flex justify-center">
          <span className={`px-3 py-1 rounded-full border text-sm font-medium ${tierStyle}`}>
            {result.tier} Lineup
          </span>
        </div>
        <p className="text-xs text-slate-600">
          Model trained on {result.model_info.training_samples} real lineups · CV RMSE ±{result.model_info.cv_rmse} pts
        </p>
      </div>

      {/* Player archetypes */}
      <div className="card p-4 space-y-3">
        <p className="stat-label">Player Archetypes & Fit</p>
        <div className="space-y-2">
          {result.players.map(p => (
            <div key={p.player_id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-3">
                <span className="text-white font-medium">{p.name}</span>
                <ArchBadge arch={p.archetype} />
              </div>
              <div className="flex gap-3 font-mono text-xs text-slate-500">
                <span>{p.pts} PPG</span>
                <span>{p.ast} APG</span>
                <span>{(p.fg3_pct * 100).toFixed(0)}% 3P</span>
              </div>
            </div>
          ))}
        </div>

        {/* Archetype balance */}
        <div className="flex gap-3 pt-2 border-t border-slate-800 text-xs flex-wrap">
          <span className={result.archetype_balance.has_primary_playmaker ? "text-court" : "text-red-400"}>
            {result.archetype_balance.has_primary_playmaker ? "✓" : "✗"} Playmaker
          </span>
          <span className={result.archetype_balance.has_interior_presence ? "text-court" : "text-orange-400"}>
            {result.archetype_balance.has_interior_presence ? "✓" : "✗"} Interior Big
          </span>
          <span className={result.archetype_balance.has_floor_spacing ? "text-court" : "text-orange-400"}>
            {result.archetype_balance.has_floor_spacing ? "✓" : "✗"} Floor Spacing
          </span>
        </div>
      </div>

      {/* Strengths / weaknesses */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-4 space-y-2">
          <p className="stat-label text-court">Strengths</p>
          {result.strengths.length === 0
            ? <p className="text-slate-500 text-sm">No standout strengths detected.</p>
            : result.strengths.map((s, i) => (
                <p key={i} className="text-sm text-slate-300 flex items-start gap-2">
                  <span className="text-court mt-0.5 flex-shrink-0">✓</span>{s}
                </p>
              ))
          }
        </div>
        <div className="card p-4 space-y-2">
          <p className="stat-label text-red-400">Weaknesses</p>
          {result.weaknesses.length === 0
            ? <p className="text-slate-500 text-sm">No major weaknesses detected.</p>
            : result.weaknesses.map((w, i) => (
                <p key={i} className="text-sm text-slate-400 flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 flex-shrink-0">⚠</span>{w}
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
        <div className="card max-w-2xl p-5 space-y-3">
          <div>
            <p className="font-semibold text-white">XGBoost Model Not Trained</p>
            <p className="text-slate-400 text-sm mt-1">
              Trains on all {new Date().getFullYear()} NBA 5-man lineups. Learns which playstyle
              combinations (scorer + playmaker, 3&D + big, etc.) produce the best net ratings.
              Takes ~60–90s.
            </p>
          </div>
          <button onClick={trainModel} disabled={training} className="btn-primary">
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
          {error && <p className="text-amber-300 text-sm">{error}</p>}
        </div>
      )}

      {modelStatus.is_trained && (
        <div className="flex items-center gap-2 text-sm text-court">
          <span className="h-2 w-2 rounded-full bg-court" />
          XGBoost model ready · {modelStatus.training_samples} training lineups · CV RMSE ±{modelStatus.cv_rmse} pts
          <span className="text-slate-600 ml-2">Player search reflects current trades</span>
        </div>
      )}

      {/* Lineup builder */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <p className="stat-label">Build Your Lineup ({filledCount}/5)</p>
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
                className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white text-sm disabled:opacity-40"
              />
              {searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded border border-slate-700 bg-slate-900 divide-y divide-slate-800">
                  {searchResults.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addPlayer(p)}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center justify-between"
                    >
                      <span className="text-sm text-slate-200">{p.full_name || p.name}</span>
                      <span className="text-xs text-slate-500">{p.team}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            onClick={predict}
            disabled={filledCount !== 5 || predicting || !modelStatus.is_trained}
            className="btn-primary w-full justify-center"
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

          {error && <p className="text-amber-300 text-sm">{error}</p>}

          <div className="card p-3 text-xs text-slate-600 space-y-1">
            <p><span className="text-slate-400">How it works:</span></p>
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
              <div className="card p-8 text-center text-slate-600 h-full flex items-center justify-center">
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
        <h1 className="text-3xl font-bold text-white">Lineup Optimizer</h1>
        <p className="mt-1 text-slate-400">
          Real 5-man lineup data from NBA API + XGBoost hypothetical lineup predictor.
        </p>
      </header>

      <div className="flex gap-1 p-1 rounded-lg bg-slate-900 w-fit">
        {[["real", "📊 Real Lineups"], ["hypo", "🔮 Hypothetical Builder"]].map(([v, label]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === v ? "bg-court text-slate-950" : "text-slate-400 hover:text-white"
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
