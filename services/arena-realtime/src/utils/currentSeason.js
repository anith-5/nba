// Single source of truth for "what NBA season is it right now", mirroring
// services/api/app/utils/season.py (duplicated rather than imported for the
// same reason apps/web and services/arena-realtime duplicate other
// server-only logic elsewhere in this codebase: separate deployments, no
// shared workspace).
//
// NBA seasons run October through June, but the label stays the same
// through the following offseason (July-September) since no new season has
// started yet. So:
//   - October, November, December -> season starting THIS year.
//   - January through September   -> season that started LAST year.
//
// Every current-season data pull in this service (current_nba_players.json,
// the fallback roster data, Wordle's current pool, Hint Auction's Current
// era) should derive its season from this module rather than hardcoding a
// literal season string -- otherwise it silently goes stale the moment a
// new season actually starts. Does NOT apply to All-Time/historical modes
// (Closest To's All-Time mode, Hint Auction's All-Time mode) -- those
// intentionally pull a fixed historical range, not "the current season".

const SEASON_ROLLOVER_MONTH = 10; // October (Date.getMonth() is 0-indexed, so this compares against +1)

// The year a season would have started in, given today's date -- e.g. 2026
// for any date from Oct 1, 2026 through Sep 30, 2027.
export function getCurrentNbaSeasonStartYear(now = new Date()) {
  const month = now.getMonth() + 1; // 1-12
  return month >= SEASON_ROLLOVER_MONTH ? now.getFullYear() : now.getFullYear() - 1;
}

// The current NBA season as "YYYY-YY", e.g. "2026-27" for any date from
// November 2026 through September 2027 (and October 2026 itself, the
// rollover month).
export function getCurrentNbaSeason(now = new Date()) {
  const startYear = getCurrentNbaSeasonStartYear(now);
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}
