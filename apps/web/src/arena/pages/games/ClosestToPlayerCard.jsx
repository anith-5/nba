import { useMemo, useState } from "react";

function PositionBadge({ position }) {
  return <span className="rounded-full bg-terracotta/20 px-2 py-0.5 text-xs font-semibold text-terracotta">{position}</span>;
}

// The player/season selection panel shown after a player accepts a team from
// the wheel. Blind Mode: no PPG appears anywhere here -- players choose a
// season based only on the year and their own basketball knowledge. Every
// player who ever played for the team is browsable (search + a fully
// scrollable alphabetical-by-last-name list), and every season that player
// played is listed, most recent first, with no cap.
export default function ClosestToPlayerCard({
  team,
  players,
  lineup,
  loading,
  error,
  source,
  dataComplete,
  note,
  onConfirm,
  canSkip,
  onUseSkip,
}) {
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

  if (error) {
    return (
      <div className="hoop-card-outline flex flex-col items-center gap-4 p-8 text-center">
        <p className="hoop-stat-label">{team?.teamName}</p>
        <p className="text-sm text-stat-down">
          Could not load player data for this team. Please use your skip to try another team.
        </p>
        {canSkip && (
          <button className="hoop-btn-primary" onClick={onUseSkip}>
            Use Skip
          </button>
        )}
      </div>
    );
  }

  if (loading || !players) {
    return (
      <div className="hoop-card-outline flex flex-col items-center gap-3 p-8 text-center">
        <div className="flex items-center gap-2">
          <p className="hoop-stat-label">{team?.teamName}</p>
          <span className="text-xs text-ink/60">Loading</span>
        </div>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-terracotta/30 border-t-court" />
        <p className="text-sm text-ink/70">
          Loading franchise history for this team. This may take a moment on first request.
        </p>
      </div>
    );
  }

  const seasonBlocked = selectedSeason && lineup[selectedSeason.position];

  return (
    <div className="hoop-card-outline animate-fade-in space-y-4 p-6">
      <div className="flex items-center justify-between">
        <p className="hoop-stat-label">{team?.teamName} Players</p>
        {dataComplete ? (
          <span className="text-xs text-terracotta">Live data</span>
        ) : (
          <span className="text-xs text-basketball">{note || "Showing limited player data"}</span>
        )}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search any NBA player by name"
        className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink outline-none focus:border-terracotta"
      />

      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {filteredPlayers.length === 0 && <p className="py-4 text-center text-sm text-ink/60">No players match.</p>}
        {filteredPlayers.map((p) => (
          <button
            key={p.player_id}
            onClick={() => selectPlayer(p)}
            className={`hoop-card-outline-hover flex w-full items-center justify-between rounded-lg px-4 py-2 text-left ${
              selectedPlayer?.player_id === p.player_id ? "border-terracotta" : ""
            }`}
          >
            <span className="text-ink">{p.name}</span>
            <PositionBadge position={p.position} />
          </button>
        ))}
      </div>

      {selectedPlayer && selectedPlayer.seasons.length === 0 && (
        <div className="space-y-2 rounded-xl border border-ink/20 bg-paper p-4 text-center">
          <p className="text-sm text-basketball">
            Season stats unavailable for this player with this team — please select another player.
          </p>
        </div>
      )}

      {selectedPlayer && selectedPlayer.seasons.length > 0 && (
        <div className="space-y-2 border-t border-ink/15 pt-4">
          <p className="hoop-stat-label">{selectedPlayer.name} Seasons</p>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {selectedPlayer.seasons.map((s) => (
              <button
                key={s.season}
                onClick={() => setSelectedSeason(s)}
                className={`hoop-card-outline-hover flex w-full items-center justify-between rounded-lg px-4 py-2 text-left ${
                  selectedSeason?.season === s.season ? "border-terracotta" : ""
                }`}
              >
                <span className="text-ink">{s.season}</span>
                <PositionBadge position={s.position} />
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedSeason && seasonBlocked && (
        <div className="space-y-3 rounded-xl border border-basketball/40 bg-paper p-4">
          <p className="text-sm text-basketball">
            You already have a player for that position ({selectedSeason.position} filled). Pick a different season
            or a different player from this team's list.
          </p>
          <button className="hoop-btn-ghost w-full" onClick={() => setSelectedSeason(null)}>
            Choose a Different Season
          </button>
        </div>
      )}

      {selectedSeason && !seasonBlocked && (
        <div className="space-y-3 rounded-xl border border-terracotta/40 bg-paper p-4">
          <p className="text-lg font-bold text-ink">{selectedPlayer.name}</p>
          <p className="text-sm text-ink/70">
            {team?.teamName} — {selectedSeason.season} — <PositionBadge position={selectedSeason.position} />
          </p>
          <div className="flex gap-3">
            <button className="hoop-btn-ghost flex-1" onClick={() => setSelectedSeason(null)}>
              Back
            </button>
            <button
              className="hoop-btn-primary flex-1"
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
