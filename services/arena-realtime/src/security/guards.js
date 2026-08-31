/**
 * Abuse guards for the socket layer.
 *
 * Until now the only thing protecting this server was that it wasn't
 * deployed. Every guard here assumes the caller is hostile and that a room
 * code is public information -- it gets shared in chat, read aloud, and is
 * only 6 characters long.
 */

// Comfortably above a real game (a full lobby is a handful of friends) and
// far below what it takes to exhaust memory with in-flight rooms.
export const MAX_PLAYERS_PER_ROOM = 12;
export const MAX_ROOMS_PER_SOCKET = 3;

// Token bucket per socket. Sized for real play -- bidding and rapid picks
// burst well above the average -- while still bounding a flood to a constant
// rate rather than "as fast as the network allows".
const BUCKET_CAPACITY = 30;
const REFILL_PER_SECOND = 10;

/**
 * Consume one token. Returns false when the socket is over its budget.
 * State lives on socket.data so it is collected along with the socket.
 */
export function allowEvent(socket) {
  const now = Date.now();
  const bucket = socket.data._bucket || { tokens: BUCKET_CAPACITY, at: now };

  const refill = ((now - bucket.at) / 1000) * REFILL_PER_SECOND;
  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + refill);
  bucket.at = now;

  if (bucket.tokens < 1) {
    socket.data._bucket = bucket;
    return false;
  }
  bucket.tokens -= 1;
  socket.data._bucket = bucket;
  return true;
}

/**
 * Is this socket actually in this room?
 *
 * game_action previously looked a room up by code and acted on it without
 * ever checking that the sender belonged to it, so anyone who knew or guessed
 * a code could vote, bid and pick in someone else's game.
 */
export function isMember(room, socketId) {
  return Boolean(room?.players?.some((p) => p.socketId === socketId));
}

/** Room codes are 6 chars from a fixed alphabet; reject anything else early. */
export function isValidRoomCode(code) {
  return typeof code === "string" && /^[A-HJ-NP-Z2-9]{6}$/.test(code.toUpperCase());
}

/** Display names: length-capped, with control characters stripped. */
export function cleanName(name, fallback) {
  if (typeof name !== "string") return fallback;
  // Control characters are filtered by code point rather than a regex
  // character class, so this source file stays plain printable ASCII.
  const stripped = Array.from(name)
    .filter((ch) => {
      const cp = ch.codePointAt(0);
      return cp > 31 && cp !== 127;
    })
    .join("")
    .trim()
    .slice(0, 24);
  return stripped || fallback;
}

// Bounds for every numeric option any game mode accepts. Anything not listed
// falls back to SAFE_NUMBER, so a newly added option can never be unbounded
// by omission -- it just gets a conservative range until it's listed here.
const SAFE_NUMBER = { min: 0, max: 1000 };
const NUMERIC_LIMITS = {
  targetNumber: { min: 1, max: 1000 },
  rounds: { min: 1, max: 30 },
  timerSeconds: { min: 5, max: 300 },
  budget: { min: 10, max: 1000 },
  hintCount: { min: 1, max: 12 },
  maxHints: { min: 1, max: 10 },
  auctionTimerSeconds: { min: 5, max: 120 },
  extensionSeconds: { min: 1, max: 60 },
  maxExtensions: { min: 0, max: 20 },
  rosterSize: { min: 1, max: 15 },
  turnTimerSeconds: { min: 5, max: 300 },
  traitSlotCount: { min: 1, max: 30 },
  pickTimerSeconds: { min: 5, max: 300 },
  manualLine: { min: 0, max: 10000 },
  eraStart: { min: 1946, max: 2100 },
  eraEnd: { min: 1946, max: 2100 },
};

function clampNumber(key, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const { min, max } = NUMERIC_LIMITS[key] || SAFE_NUMBER;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function coerce(key, defaultValue, value, depth) {
  if (typeof defaultValue === "number") return clampNumber(key, value);
  if (typeof defaultValue === "boolean") return Boolean(value);
  if (typeof defaultValue === "string") {
    return typeof value === "string" && value.length <= 40 ? value : undefined;
  }
  // A null default means "optional" -- it may arrive as a number, a short
  // string, or stay null.
  if (defaultValue === null) {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return clampNumber(key, value);
    return typeof value === "string" && value.length <= 40 ? value : undefined;
  }
  // One level of nesting (Themed Draft's secondaryParam: { team: "LAL" }).
  if (defaultValue && typeof defaultValue === "object" && depth === 0) {
    return sanitizeConfig(defaultValue, value, 1);
  }
  return undefined;
}

/**
 * Merge caller-supplied game options over the defaults, safely.
 *
 * start_game used to spread the client's `config` straight over the defaults,
 * so `{rounds: 1e9, hintCount: 9999}` was accepted verbatim and the server
 * would try to build it. Two rules fix that: only keys that already exist in
 * the defaults are copied at all, and every value is coerced to the default's
 * type and clamped to a sane range.
 */
export function sanitizeConfig(defaults, overrides, depth = 0) {
  const out = { ...defaults };
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return out;
  }
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;
    const coerced = coerce(key, defaultValue, overrides[key], depth);
    if (coerced !== undefined) out[key] = coerced;
  }
  return out;
}
