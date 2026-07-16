import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GAME_MODES } from "../data/gameModes.js";
import { STAT_CATEGORIES, STAT_GROUP_ORDER, STAT_GROUP_LABELS } from "../data/statCategories.js";
import RoomCodeBadge from "../components/RoomCodeBadge.jsx";
import PlayerList from "../components/PlayerList.jsx";
import { useSocket } from "../socket/useSocket.js";

const OVER_UNDER_POOL_OPTIONS = [
  { value: "all", label: "All Players Ever" },
  { value: "all-stars", label: "All Stars Only" },
  { value: "champions", label: "Champions Only" },
  { value: "hall-of-famers", label: "Hall of Famers Only" },
  { value: "first-round", label: "First Round Picks Only" },
  { value: "undrafted", label: "Undrafted Players Only" },
  { value: "international", label: "International Players Only" },
  { value: "role-players", label: "Role Players Only" },
];

function OverUnderConfigForm({ config, setConfig }) {
  return (
    <div className="card space-y-4 p-5 text-left">
      <p className="stat-label">Over/Under Settings</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="stat-label mb-1 block">Rounds</label>
          <select
            value={config.rounds}
            onChange={(e) => setConfig({ ...config, rounds: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            {[5, 10, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="stat-label mb-1 block">Timer</label>
          <select
            value={config.timerSeconds}
            onChange={(e) => setConfig({ ...config, timerSeconds: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            {[10, 20, 30].map((n) => (
              <option key={n} value={n}>
                {n}s
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="stat-label mb-1 block">Stat Category</label>
          <select
            value={config.statCategory}
            onChange={(e) => setConfig({ ...config, statCategory: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            {STAT_GROUP_ORDER.map((group) => (
              <optgroup key={group} label={STAT_GROUP_LABELS[group]}>
                {Object.entries(STAT_CATEGORIES)
                  .filter(([, meta]) => meta.group === group)
                  .map(([key, meta]) => (
                    <option key={key} value={key}>
                      {meta.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="stat-label mb-1 block">Difficulty</label>
          <select
            value={config.difficulty}
            onChange={(e) => setConfig({ ...config, difficulty: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="stat-label mb-1 block">Player Pool</label>
          <select
            value={config.poolFilter}
            onChange={(e) => setConfig({ ...config, poolFilter: e.target.value })}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          >
            {OVER_UNDER_POOL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

const CURRENT_YEAR = new Date().getFullYear();

function ClosestToConfigForm({ config, setConfig }) {
  const avgPerPlayer = (config.targetNumber / 5).toFixed(1);

  return (
    <div className="card space-y-5 p-5 text-left">
      <p className="stat-label">Closest To Settings</p>

      <div>
        <label className="stat-label mb-1 block">Points Target</label>
        <input
          type="number"
          min={50}
          max={200}
          step={1}
          value={config.targetNumber}
          onChange={(e) =>
            setConfig({ ...config, targetNumber: Math.max(50, Math.min(200, Number(e.target.value) || 50)) })
          }
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        />
        <p className="mt-1 text-xs text-slate-500">
          Build a 5-player starting lineup whose combined PPG gets as close to this number as possible without
          going over — an average of {avgPerPlayer} PPG per player.
        </p>
      </div>

      <div>
        <label className="stat-label mb-2 block">Number of Rounds</label>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setConfig({ ...config, rounds: n })}
              className={config.rounds === n ? "btn-primary" : "btn-ghost"}
            >
              {n} {n === 1 ? "Round" : "Rounds"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="stat-label mb-1 block">Player Era</label>
        <select
          value={config.era}
          onChange={(e) => setConfig({ ...config, era: e.target.value })}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
        >
          <option value="all-time">All Time</option>
          <option value="modern">Modern Only (2015-16 to present)</option>
          <option value="classic">Classic Only (before 2000)</option>
          <option value="custom">Custom Range</option>
        </select>
        {config.era === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="stat-label mb-1 block text-xs">Start Year</label>
              <input
                type="number"
                min={1946}
                max={CURRENT_YEAR}
                value={config.eraStart ?? 1946}
                onChange={(e) => setConfig({ ...config, eraStart: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="stat-label mb-1 block text-xs">End Year</label>
              <input
                type="number"
                min={1946}
                max={CURRENT_YEAR}
                value={config.eraEnd ?? CURRENT_YEAR}
                onChange={(e) => setConfig({ ...config, eraEnd: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="stat-label mb-2 block">Skip Rule</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setConfig({ ...config, skipRule: "one-skip" })}
            className={config.skipRule === "one-skip" ? "btn-primary" : "btn-ghost"}
          >
            One Skip Per Round
          </button>
          <button
            type="button"
            onClick={() => setConfig({ ...config, skipRule: "no-skips" })}
            className={config.skipRule === "no-skips" ? "btn-primary" : "btn-ghost"}
          >
            No Skips
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WaitingRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { room, myId, startGame, error } = useSocket();
  const [overUnderConfig, setOverUnderConfig] = useState({
    rounds: 5,
    timerSeconds: 20,
    statCategory: "career_ppg",
    lineMode: "auto",
    difficulty: "medium",
    poolFilter: "all",
  });
  const [closestToConfig, setClosestToConfig] = useState({
    targetNumber: 100,
    rounds: 1,
    era: "all-time",
    eraStart: null,
    eraEnd: null,
    skipRule: "one-skip",
  });

  const gameMode = GAME_MODES.find((m) => m.id === room?.gameMode);
  const isHost = room && myId === room.hostSocketId;
  const canStart = room && room.players.length >= 2;

  useEffect(() => {
    if (room?.status === "in-game") {
      navigate(`/arena/games/${room.gameMode}/${code}`);
    }
  }, [room?.status, room?.gameMode, code, navigate]);

  if (!room) {
    return (
      <div className="animate-fade-in space-y-4">
        <p className="text-slate-400">
          No active room found for <span className="font-mono text-white">{code}</span>. If you refreshed the
          page, head back to{" "}
          <a href="/arena" className="text-court underline">
            the Arena hub
          </a>{" "}
          and rejoin with the code.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex flex-col items-center gap-4 text-center">
        <RoomCodeBadge code={room.code} />
        <p className="text-slate-400">{gameMode?.name || room.gameMode}</p>
      </header>

      <div className="mx-auto max-w-md space-y-4">
        <p className="stat-label">Players ({room.players.length})</p>
        <PlayerList players={room.players} hostSocketId={room.hostSocketId} />

        {error && <p className="text-sm text-amber-300">{error}</p>}

        {isHost && room.gameMode === "over-under" && (
          <OverUnderConfigForm config={overUnderConfig} setConfig={setOverUnderConfig} />
        )}
        {isHost && room.gameMode === "closest-to" && (
          <ClosestToConfigForm config={closestToConfig} setConfig={setClosestToConfig} />
        )}

        {isHost ? (
          <button
            onClick={() =>
              startGame(
                room.gameMode === "over-under"
                  ? overUnderConfig
                  : room.gameMode === "closest-to"
                    ? closestToConfig
                    : {}
              )
            }
            disabled={!canStart}
            className="btn-primary w-full disabled:opacity-50"
          >
            {canStart ? "Start Game" : "Waiting for at least 2 players…"}
          </button>
        ) : room.gameMode === "closest-to" ? (
          <p className="text-center text-sm text-slate-500">Host is setting up the game…</p>
        ) : (
          <p className="text-center text-sm text-slate-500">Waiting for the host to start the game…</p>
        )}
      </div>
    </div>
  );
}
