import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { GAME_MODES } from "../data/gameModes.js";
import { STAT_CATEGORIES, STAT_GROUP_ORDER, STAT_GROUP_LABELS } from "../data/statCategories.js";
import { TEAM_FULL_NAMES } from "../utils/fiveHintsGenerator.js";
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
    <div className="hoop-card-outline space-y-4 p-5 text-left">
      <p className="hoop-stat-label">Over/Under Settings</p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="hoop-stat-label mb-1 block">Rounds</label>
          <select
            value={config.rounds}
            onChange={(e) => setConfig({ ...config, rounds: Number(e.target.value) })}
            className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
          >
            {[5, 10, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="hoop-stat-label mb-1 block">Timer</label>
          <select
            value={config.timerSeconds}
            onChange={(e) => setConfig({ ...config, timerSeconds: Number(e.target.value) })}
            className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
          >
            {[10, 20, 30].map((n) => (
              <option key={n} value={n}>
                {n}s
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="hoop-stat-label mb-1 block">Stat Category</label>
          <select
            value={config.statCategory}
            onChange={(e) => setConfig({ ...config, statCategory: e.target.value })}
            className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
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
          <label className="hoop-stat-label mb-1 block">Difficulty</label>
          <select
            value={config.difficulty}
            onChange={(e) => setConfig({ ...config, difficulty: e.target.value })}
            className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className="hoop-stat-label mb-1 block">Player Pool</label>
          <select
            value={config.poolFilter}
            onChange={(e) => setConfig({ ...config, poolFilter: e.target.value })}
            className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
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

function FiveHintsConfigForm({ config, setConfig }) {
  return (
    <div className="hoop-card-outline space-y-5 p-5 text-left">
      <p className="hoop-stat-label">Five Hints Settings</p>

      <div>
        <label className="hoop-stat-label mb-1 block">Number of Rounds</label>
        <select
          value={config.rounds}
          onChange={(e) => setConfig({ ...config, rounds: Number(e.target.value) })}
          className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
        >
          {Array.from({ length: 16 }, (_, i) => i + 5).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="hoop-stat-label mb-2 block">Buzz In Style</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setConfig({ ...config, buzzStyle: "competitive" })}
            className={`hoop-card-outline-hover rounded-xl border p-4 text-left ${
              config.buzzStyle === "competitive" ? "border-terracotta bg-terracotta/10" : "border-ink/15"
            }`}
          >
            <p className="font-semibold text-ink">Competitive</p>
            <p className="mt-1 text-xs text-ink/70">First to buzz gets 10 seconds to answer. Wrong guesses lock you out.</p>
          </button>
          <button
            type="button"
            onClick={() => setConfig({ ...config, buzzStyle: "casual" })}
            className={`hoop-card-outline-hover rounded-xl border p-4 text-left ${
              config.buzzStyle === "casual" ? "border-terracotta bg-terracotta/10" : "border-ink/15"
            }`}
          >
            <p className="font-semibold text-ink">Casual</p>
            <p className="mt-1 text-xs text-ink/70">Everyone submits a guess or passes after each hint, revealed together.</p>
          </button>
        </div>
      </div>

      <div>
        <label className="hoop-stat-label mb-2 block">Hint Reveal Timing</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setConfig({ ...config, hintTiming: "auto" })}
            className={config.hintTiming === "auto" ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            Auto (20s)
          </button>
          <button
            type="button"
            onClick={() => setConfig({ ...config, hintTiming: "host" })}
            className={config.hintTiming === "host" ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            Host Controlled
          </button>
        </div>
      </div>

      <div>
        <label className="hoop-stat-label mb-1 block">Player Pool</label>
        <select
          value={config.poolFilter}
          onChange={(e) => setConfig({ ...config, poolFilter: e.target.value, position: null })}
          className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
        >
          <option value="all">All Players Ever</option>
          <option value="legends">Legends Only (Hall of Famers)</option>
          <option value="modern">Modern Only (2010 to present)</option>
          <option value="current">Current Players Only</option>
          <option value="position">By Position</option>
        </select>
        {config.poolFilter === "position" && (
          <select
            value={config.position || "PG"}
            onChange={(e) => setConfig({ ...config, position: e.target.value })}
            className="mt-2 w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
          >
            <option value="PG">Point Guard</option>
            <option value="SG">Shooting Guard</option>
            <option value="SF">Small Forward</option>
            <option value="PF">Power Forward</option>
            <option value="C">Center</option>
          </select>
        )}
      </div>

      <div>
        <label className="hoop-stat-label mb-2 block">Hints Before Answer Reveals</label>
        <div className="grid grid-cols-3 gap-3">
          {[3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setConfig({ ...config, maxHints: n })}
              className={config.maxHints === n ? "hoop-btn-primary" : "hoop-btn-ghost"}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function HintAuctionConfigForm({ config, setConfig }) {
  return (
    <div className="hoop-card-outline space-y-5 p-5 text-left">
      <p className="hoop-stat-label">Hint Auction Settings</p>

      <div>
        <label className="hoop-stat-label mb-1 block">Starting Budget</label>
        <input
          type="number"
          min={10}
          max={1000}
          step={10}
          value={config.budget}
          onChange={(e) => setConfig({ ...config, budget: Math.max(10, Math.min(1000, Number(e.target.value) || 100)) })}
          className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
        />
        <p className="mt-1 text-xs text-ink/60">Every player starts with this much to spend across the whole draft.</p>
      </div>

      <div>
        <label className="hoop-stat-label mb-2 block">Roster Spots</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setConfig({ ...config, benchEnabled: false })}
            className={config.benchEnabled === false ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            PG / SG / SF / PF / C
          </button>
          <button
            type="button"
            onClick={() => setConfig({ ...config, benchEnabled: true })}
            className={config.benchEnabled === true ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            + Bench Spot
          </button>
        </div>
        <p className="mt-1 text-xs text-ink/60">
          One mystery player is auctioned per round, so the draft runs until every player's roster is full
          — total rounds scale with lobby size.
        </p>
      </div>

      <div>
        <label className="hoop-stat-label mb-2 block">Hint Mode</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setConfig({ ...config, hintMode: "standard", hintCount: 7 })}
            className={config.hintMode === "standard" ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            Standard (7 hints)
          </button>
          <button
            type="button"
            onClick={() => setConfig({ ...config, hintMode: "obscure", hintCount: config.hintCount === 7 ? 4 : config.hintCount })}
            className={config.hintMode === "obscure" ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            Obscure (fewer hints)
          </button>
        </div>
        {config.hintMode === "obscure" && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            {[3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setConfig({ ...config, hintCount: n })}
                className={config.hintCount === n ? "hoop-btn-primary" : "hoop-btn-ghost"}
              >
                {n} hints
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="hoop-stat-label mb-1 block">Auction Timer</label>
        <select
          value={config.auctionTimerSeconds}
          onChange={(e) => setConfig({ ...config, auctionTimerSeconds: Number(e.target.value) })}
          className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
        >
          {[10, 15, 20, 30].map((n) => (
            <option key={n} value={n}>
              {n}s
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="hoop-stat-label mb-2 block">Timer Extensions</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setConfig({ ...config, extensionsEnabled: true })}
            className={config.extensionsEnabled ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            Extend on New Bids
          </button>
          <button
            type="button"
            onClick={() => setConfig({ ...config, extensionsEnabled: false })}
            className={!config.extensionsEnabled ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            Hard Countdown
          </button>
        </div>
        {config.extensionsEnabled && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="hoop-stat-label mb-1 block text-xs">Extend By</label>
              <select
                value={config.extensionSeconds}
                onChange={(e) => setConfig({ ...config, extensionSeconds: Number(e.target.value) })}
                className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
              >
                {[3, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}s
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="hoop-stat-label mb-1 block text-xs">Max Extensions</label>
              <select
                value={config.maxExtensions}
                onChange={(e) => setConfig({ ...config, maxExtensions: Number(e.target.value) })}
                className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
              >
                {[3, 5, 10, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="hoop-stat-label mb-2 block">Player Era</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setConfig({ ...config, era: "all-time" })}
            className={config.era === "all-time" ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            All-Time
          </button>
          <button
            type="button"
            onClick={() => setConfig({ ...config, era: "current" })}
            className={config.era === "current" ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            Current Rosters
          </button>
        </div>
      </div>

      <div>
        <label className="hoop-stat-label mb-1 block">Player Pool</label>
        <select
          value={config.poolFilter}
          onChange={(e) => setConfig({ ...config, poolFilter: e.target.value, position: null })}
          className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
        >
          <option value="all">All Players</option>
          <option value="legends">Elite Tier Only</option>
          <option value="position">By Position</option>
        </select>
        {config.poolFilter === "position" && (
          <select
            value={config.position || "PG"}
            onChange={(e) => setConfig({ ...config, position: e.target.value })}
            className="mt-2 w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
          >
            <option value="PG">Point Guard</option>
            <option value="SG">Shooting Guard</option>
            <option value="SF">Small Forward</option>
            <option value="PF">Power Forward</option>
            <option value="C">Center</option>
          </select>
        )}
      </div>
    </div>
  );
}

const CURRENT_YEAR = new Date().getFullYear();

function ClosestToConfigForm({ config, setConfig }) {
  const avgPerPlayer = (config.targetNumber / 5).toFixed(1);

  return (
    <div className="hoop-card-outline space-y-5 p-5 text-left">
      <p className="hoop-stat-label">Closest To Settings</p>

      <div>
        <label className="hoop-stat-label mb-1 block">Points Target</label>
        <input
          type="number"
          min={50}
          max={200}
          step={1}
          value={config.targetNumber}
          onChange={(e) =>
            setConfig({ ...config, targetNumber: Math.max(50, Math.min(200, Number(e.target.value) || 50)) })
          }
          className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
        />
        <p className="mt-1 text-xs text-ink/60">
          Build a 5-player starting lineup whose combined PPG gets as close to this number as possible without
          going over — an average of {avgPerPlayer} PPG per player.
        </p>
      </div>

      <div>
        <label className="hoop-stat-label mb-2 block">Number of Rounds</label>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setConfig({ ...config, rounds: n })}
              className={config.rounds === n ? "hoop-btn-primary" : "hoop-btn-ghost"}
            >
              {n} {n === 1 ? "Round" : "Rounds"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="hoop-stat-label mb-1 block">Player Era</label>
        <select
          value={config.era}
          onChange={(e) => setConfig({ ...config, era: e.target.value })}
          className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
        >
          <option value="all-time">All Time</option>
          <option value="modern">Modern Only (2015-16 to present)</option>
          <option value="classic">Classic Only (before 2000)</option>
          <option value="custom">Custom Range</option>
        </select>
        {config.era === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="hoop-stat-label mb-1 block text-xs">Start Year</label>
              <input
                type="number"
                min={1946}
                max={CURRENT_YEAR}
                value={config.eraStart ?? 1946}
                onChange={(e) => setConfig({ ...config, eraStart: Number(e.target.value) })}
                className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
              />
            </div>
            <div>
              <label className="hoop-stat-label mb-1 block text-xs">End Year</label>
              <input
                type="number"
                min={1946}
                max={CURRENT_YEAR}
                value={config.eraEnd ?? CURRENT_YEAR}
                onChange={(e) => setConfig({ ...config, eraEnd: Number(e.target.value) })}
                className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
              />
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="hoop-stat-label mb-2 block">Skip Rule</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setConfig({ ...config, skipRule: "one-skip" })}
            className={config.skipRule === "one-skip" ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            One Skip Per Round
          </button>
          <button
            type="button"
            onClick={() => setConfig({ ...config, skipRule: "no-skips" })}
            className={config.skipRule === "no-skips" ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            No Skips
          </button>
        </div>
      </div>
    </div>
  );
}

const THEMED_DRAFT_TEAM_OPTIONS = Object.entries(TEAM_FULL_NAMES).sort((a, b) => a[1].localeCompare(b[1]));

const THEMED_DRAFT_AWARD_OPTIONS = [
  { value: "mvp", label: "MVP Winners" },
  { value: "finals_mvp", label: "Finals MVP Winners" },
  { value: "dpoy", label: "Defensive Player of the Year Winners" },
  { value: "roy", label: "Rookie of the Year Winners" },
  { value: "sixth_man", label: "Sixth Man of the Year Winners" },
  { value: "all-star", label: "All-Stars" },
  { value: "hall-of-fame", label: "Hall of Famers" },
];

const THEMED_DRAFT_ARCHETYPE_OPTIONS = [
  { value: "guard-scorer", label: "Guard Scorers" },
  { value: "guard-defender", label: "Guard Defenders" },
  { value: "wing-scorer", label: "Wing Scorers" },
  { value: "wing-defender", label: "Wing Defenders" },
  { value: "big-scorer", label: "Big Scorers" },
  { value: "big-defender", label: "Big Defenders" },
];

const THEMED_DRAFT_CATEGORY_OPTIONS = [
  { value: "team", label: "Single Team" },
  { value: "era", label: "Era / Decade" },
  { value: "award", label: "Award Winners" },
  { value: "archetype", label: "Playstyle Archetype" },
  { value: "stat-threshold", label: "Stat Threshold" },
  { value: "current-season", label: "Current Season Only" },
];

function ThemedDraftConfigForm({ config, setConfig }) {
  const secondary = config.secondaryParam || {};

  function setSecondary(patch) {
    setConfig({ ...config, secondaryParam: { ...secondary, ...patch } });
  }

  function setCategory(category) {
    // Each category gets a sensible default secondaryParam the moment it's
    // selected, so the draft is always startable without extra required
    // steps -- same "never leave a stall point" default-friendliness as the
    // rest of the config forms above.
    const defaults = {
      team: { team: "LAL" },
      era: { era: "modern" },
      award: { award: "all-star" },
      archetype: { archetype: "guard-scorer" },
      "stat-threshold": { statKey: "career_ppg", threshold: 25 },
      "current-season": {},
    };
    setConfig({ ...config, category, secondaryParam: defaults[category] || {} });
  }

  return (
    <div className="hoop-card-outline space-y-5 p-5 text-left">
      <p className="hoop-stat-label">Themed Player Draft Settings</p>

      <div>
        <label className="hoop-stat-label mb-1 block">Theme</label>
        <select
          value={config.category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
        >
          {THEMED_DRAFT_CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {config.category === "team" && (
          <select
            value={secondary.team || "LAL"}
            onChange={(e) => setSecondary({ team: e.target.value })}
            className="mt-2 w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
          >
            {THEMED_DRAFT_TEAM_OPTIONS.map(([abbr, name]) => (
              <option key={abbr} value={abbr}>
                {name}
              </option>
            ))}
          </select>
        )}

        {config.category === "era" && (
          <>
            <select
              value={secondary.era || "modern"}
              onChange={(e) => setSecondary({ era: e.target.value })}
              className="mt-2 w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
            >
              <option value="modern">Modern Only (2015-16 to present)</option>
              <option value="classic">Classic Only (before 2000)</option>
              <option value="custom">Custom Range</option>
            </select>
            {secondary.era === "custom" && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="hoop-stat-label mb-1 block text-xs">Start Year</label>
                  <input
                    type="number"
                    min={1946}
                    max={CURRENT_YEAR}
                    value={secondary.eraStart ?? 1946}
                    onChange={(e) => setSecondary({ eraStart: Number(e.target.value) })}
                    className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
                  />
                </div>
                <div>
                  <label className="hoop-stat-label mb-1 block text-xs">End Year</label>
                  <input
                    type="number"
                    min={1946}
                    max={CURRENT_YEAR}
                    value={secondary.eraEnd ?? CURRENT_YEAR}
                    onChange={(e) => setSecondary({ eraEnd: Number(e.target.value) })}
                    className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {config.category === "award" && (
          <select
            value={secondary.award || "all-star"}
            onChange={(e) => setSecondary({ award: e.target.value })}
            className="mt-2 w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
          >
            {THEMED_DRAFT_AWARD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {config.category === "archetype" && (
          <select
            value={secondary.archetype || "guard-scorer"}
            onChange={(e) => setSecondary({ archetype: e.target.value })}
            className="mt-2 w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
          >
            {THEMED_DRAFT_ARCHETYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {config.category === "stat-threshold" && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <select
              value={secondary.statKey || "career_ppg"}
              onChange={(e) => setSecondary({ statKey: e.target.value })}
              className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
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
            <input
              type="number"
              value={secondary.threshold ?? 25}
              onChange={(e) => setSecondary({ threshold: Number(e.target.value) })}
              placeholder="Minimum value"
              className="w-full rounded-lg border border-ink/20 bg-paper px-3 py-2 text-ink"
            />
          </div>
        )}

        {config.category === "current-season" && (
          <p className="mt-2 text-xs text-ink/60">Draws from this season's live rosters, synced automatically.</p>
        )}
      </div>

      <div>
        <label className="hoop-stat-label mb-2 block">Roster Size</label>
        <div className="grid grid-cols-5 gap-2">
          {[3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setConfig({ ...config, rosterSize: n })}
              className={config.rosterSize === n ? "hoop-btn-primary" : "hoop-btn-ghost"}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="hoop-stat-label mb-2 block">Turn Timer</label>
        <div className="grid grid-cols-4 gap-2">
          {[15, 30, 60, null].map((n) => (
            <button
              key={n ?? "none"}
              type="button"
              onClick={() => setConfig({ ...config, turnTimerSeconds: n })}
              className={config.turnTimerSeconds === n ? "hoop-btn-primary" : "hoop-btn-ghost"}
            >
              {n ? `${n}s` : "No Timer"}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink/60">
          If a pick isn't made in time, a random available player is auto-picked so the draft never stalls.
        </p>
      </div>
    </div>
  );
}

function BuildAPlayerConfigForm({ config, setConfig }) {
  return (
    <div className="hoop-card-outline space-y-5 p-5 text-left">
      <p className="hoop-stat-label">Build a Player Settings</p>

      <div>
        <label className="hoop-stat-label mb-2 block">Trait Slots to Fill</label>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {[6, 7, 8, 9, 10, 11, 12].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setConfig({ ...config, traitSlotCount: n })}
              className={config.traitSlotCount === n ? "hoop-btn-primary" : "hoop-btn-ghost"}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink/60">Fewer slots means a shorter game — everyone builds toward the same count.</p>
      </div>

      <div>
        <label className="hoop-stat-label mb-2 block">Pick Timer</label>
        <div className="grid grid-cols-4 gap-2">
          {[15, 30, 60, null].map((n) => (
            <button
              key={n ?? "none"}
              type="button"
              onClick={() => setConfig({ ...config, pickTimerSeconds: n })}
              className={config.pickTimerSeconds === n ? "hoop-btn-primary" : "hoop-btn-ghost"}
            >
              {n ? `${n}s` : "No Timer"}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-ink/60">
          If you haven't picked or passed in time, a random eligible trait is auto-picked so the round never stalls.
        </p>
      </div>
    </div>
  );
}

function EightyTwoOhConfigForm({ config, setConfig }) {
  return (
    <div className="hoop-card-outline space-y-5 p-5 text-left">
      <p className="hoop-stat-label">NBA 82-0 Settings</p>

      <div>
        <label className="hoop-stat-label mb-2 block">Roster Slots</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setConfig({ ...config, benchEnabled: false })}
            className={config.benchEnabled === false ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            PG / SG / SF / PF / C
          </button>
          <button
            type="button"
            onClick={() => setConfig({ ...config, benchEnabled: true })}
            className={config.benchEnabled === true ? "hoop-btn-primary" : "hoop-btn-ghost"}
          >
            + Bench Spot
          </button>
        </div>
        <p className="mt-1 text-xs text-ink/60">
          Spin a team + decade each round, draft the best available player, then reassign freely before finalizing.
        </p>
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
  const [fiveHintsConfig, setFiveHintsConfig] = useState({
    rounds: 10,
    buzzStyle: "competitive",
    hintTiming: "auto",
    poolFilter: "all",
    position: null,
    maxHints: 5,
  });
  const [hintAuctionConfig, setHintAuctionConfig] = useState({
    budget: 100,
    benchEnabled: false,
    hintMode: "standard",
    hintCount: 7,
    auctionTimerSeconds: 20,
    extensionsEnabled: true,
    extensionSeconds: 5,
    maxExtensions: 5,
    poolFilter: "all",
    position: null,
    era: "all-time",
  });
  const [themedDraftConfig, setThemedDraftConfig] = useState({
    category: "team",
    secondaryParam: { team: "LAL" },
    rosterSize: 5,
    turnTimerSeconds: 30,
  });
  const [buildAPlayerConfig, setBuildAPlayerConfig] = useState({
    traitSlotCount: 12,
    pickTimerSeconds: 30,
  });
  const [eightyTwoOhConfig, setEightyTwoOhConfig] = useState({
    benchEnabled: false,
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
        <p className="text-ink/70">
          No active room found for <span className="font-mono text-ink">{code}</span>. If you refreshed the
          page, head back to{" "}
          <a href="/arena" className="text-terracotta underline">
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
        <p className="text-ink/70">{gameMode?.name || room.gameMode}</p>
      </header>

      <div className="mx-auto max-w-md space-y-4">
        <p className="hoop-stat-label">Players ({room.players.length})</p>
        <PlayerList players={room.players} hostSocketId={room.hostSocketId} />

        {error && <p className="text-sm text-basketball">{error}</p>}

        {isHost && room.gameMode === "over-under" && (
          <OverUnderConfigForm config={overUnderConfig} setConfig={setOverUnderConfig} />
        )}
        {isHost && room.gameMode === "closest-to" && (
          <ClosestToConfigForm config={closestToConfig} setConfig={setClosestToConfig} />
        )}
        {isHost && room.gameMode === "five-hints" && (
          <FiveHintsConfigForm config={fiveHintsConfig} setConfig={setFiveHintsConfig} />
        )}
        {isHost && room.gameMode === "hint-auction" && (
          <HintAuctionConfigForm config={hintAuctionConfig} setConfig={setHintAuctionConfig} />
        )}
        {isHost && room.gameMode === "draft" && (
          <ThemedDraftConfigForm config={themedDraftConfig} setConfig={setThemedDraftConfig} />
        )}
        {isHost && room.gameMode === "build-a-player" && (
          <BuildAPlayerConfigForm config={buildAPlayerConfig} setConfig={setBuildAPlayerConfig} />
        )}
        {isHost && room.gameMode === "82-0" && (
          <EightyTwoOhConfigForm config={eightyTwoOhConfig} setConfig={setEightyTwoOhConfig} />
        )}

        {isHost ? (
          <button
            onClick={() =>
              startGame(
                room.gameMode === "over-under"
                  ? overUnderConfig
                  : room.gameMode === "closest-to"
                    ? closestToConfig
                    : room.gameMode === "five-hints"
                      ? fiveHintsConfig
                      : room.gameMode === "hint-auction"
                        ? hintAuctionConfig
                        : room.gameMode === "draft"
                          ? themedDraftConfig
                          : room.gameMode === "build-a-player"
                            ? buildAPlayerConfig
                            : room.gameMode === "82-0"
                              ? eightyTwoOhConfig
                              : {}
              )
            }
            disabled={!canStart}
            className="hoop-btn-primary w-full disabled:opacity-50"
          >
            {canStart ? "Start Game" : "Waiting for at least 2 players…"}
          </button>
        ) : room.gameMode === "closest-to" ||
          room.gameMode === "five-hints" ||
          room.gameMode === "hint-auction" ||
          room.gameMode === "draft" ||
          room.gameMode === "build-a-player" ||
          room.gameMode === "82-0" ? (
          <p className="text-center text-sm text-ink/60">Host is setting up the game…</p>
        ) : (
          <p className="text-center text-sm text-ink/60">Waiting for the host to start the game…</p>
        )}
      </div>
    </div>
  );
}
