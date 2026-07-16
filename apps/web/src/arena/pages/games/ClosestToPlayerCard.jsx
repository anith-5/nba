import { useMemo, useState } from "react";

function PositionBadge({ position }) {
  return <span className="rounded-full bg-court/20 px-2 py-0.5 text-xs font-semibold text-court">{position}</span>;
}

// The player/season selection panel shown after a player accepts a team from
// the wheel. Blind Mode: no PPG appears anywhere here -- players choose a
// season based only on the year and their own basketball knowledge. Every
// player who ever played for the team is browsable (search + a fully
// scrollable alphabetical-by-last-name list), and every season that player
// played is listed, most recent first, with no cap.
export default function ClosestToPlayerCard({ team, players, lineup, loading, source, dataComplete, note, onConfirm }) {
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(null);

  const filteredPlayers = useMemo(() => {
    if (!players) return [];
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.name.toLowerCase().includes(q));
  }, [players, search]);

  function selectPlayer(p) {
    setSelectedPlayer(p);
    setSelectedSeason(null);
  }

  if (loading || !players) {
    return (
      <div className="card flex flex-col items-center gap-3 p-8 text-center">
        <p className="stat-label">{team?.teamName}</p>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-court/30 border-t-court" />
        <p className="text-sm text-slate-400">Loading roster…</p>
      </div>
    );
  }

  const seasonBlocked = selectedSeason && lineup[selectedSeason.position];

  return (
    <div className="card animate-fade-in space-y-4 p-6">
      <div className="flex items-center justify-between">
        <p className="stat-label">{team?.teamName} Players</p>
        {!dataComplete && <span className="text-xs text-amber-300">{note || "Showing limited player data"}</span>}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search any NBA player by name"
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-court"
      />

      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {filteredPlayers.length === 0 && <p className="py-4 text-center text-sm text-slate-500">No players match.</p>}
        {filteredPlayers.map((p) => (
          <button
            key={p.player_id}
            onClick={() => selectPlayer(p)}
            className={`card-hover flex w-full items-center justify-between rounded-lg px-4 py-2 text-left ${
              selectedPlayer?.player_id === p.player_id ? "border-court" : ""
            }`}
          >
            <span className="text-white">{p.name}</span>
            <PositionBadge position={p.position} />
          </button>
        ))}
      </div>

      {selectedPlayer && selectedPlayer.seasons.length === 0 && (
        <div className="space-y-2 rounded-xl border border-slate-700 bg-slate-950 p-4 text-center">
          <p className="text-sm text-amber-300">
            Season stats unavailable for this player with this team — please select another player.
          </p>
        </div>
      )}

      {selectedPlayer && selectedPlayer.seasons.length > 0 && (
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <p className="stat-label">{selectedPlayer.name} Seasons</p>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {selectedPlayer.seasons.map((s) => (
              <button
                key={s.season}
                onClick={() => setSelectedSeason(s)}
                className={`card-hover flex w-full items-center justify-between rounded-lg px-4 py-2 text-left ${
                  selectedSeason?.season === s.season ? "border-court" : ""
                }`}
              >
                <span className="text-white">{s.season}</span>
                <PositionBadge position={s.position} />
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedSeason && seasonBlocked && (
        <div className="space-y-3 rounded-xl border border-amber-500/40 bg-slate-950 p-4">
          <p className="text-sm text-amber-300">
            You already have a player for that position ({selectedSeason.position} filled). Pick a different season
            or a different player from this team's list.
          </p>
          <button className="btn-ghost w-full" onClick={() => setSelectedSeason(null)}>
            Choose a Different Season
          </button>
        </div>
      )}

      {selectedSeason && !seasonBlocked && (
        <div className="space-y-3 rounded-xl border border-court/40 bg-slate-950 p-4">
          <p className="text-lg font-bold text-white">{selectedPlayer.name}</p>
          <p className="text-sm text-slate-400">
            {team?.teamName} — {selectedSeason.season} — <PositionBadge position={selectedSeason.position} />
          </p>
          <div className="flex gap-3">
            <button className="btn-ghost flex-1" onClick={() => setSelectedSeason(null)}>
              Back
            </button>
            <button
              className="btn-primary flex-1"
              onClick={() =>
                onConfirm({
                  playerId: selectedPlayer.player_id,
                  season: selectedSeason.season,
                  position: selectedSeason.position,
                })
              }
            >
              Confirm Pick
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
