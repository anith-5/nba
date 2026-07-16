// Server-authoritative game logic for Five Hints — a buzzer game where a
// mystery NBA player is revealed through up to 5 progressively-specific
// hints. The mystery player, the full hint text, and the accepted-answer
// list all live ONLY here on the server until a round resolves; clients are
// only ever told the hint text for hints already revealed (see
// sanitize.js's sanitizeFiveHints), exactly like Closest To's Blind Mode
// hides PPG until reveal.
//
// The hint-generation algorithm itself is intentionally duplicated (not
// imported) from apps/web/src/arena/utils/fiveHintsGenerator.js — same
// reason apps/web/src/arena/data/statCategories.js duplicates
// services/arena-realtime/src/game-logic/overUnder.js's STAT_CATEGORIES:
// the frontend and the realtime server are separate deployments with no
// shared workspace, so a cross-package relative import would work locally
// and silently break in production.
import players from "../data/nba_players.json" with { type: "json" };

export const POSITIONS = ["PG", "SG", "SF", "PF", "C"];

const POSITION_NAMES = {
  PG: "point guard",
  SG: "shooting guard",
  SF: "small forward",
  PF: "power forward",
  C: "center",
};

const POSITION_WEIGHT_BASELINE = {
  PG: { weight: 185, heightInches: 74 },
  SG: { weight: 205, heightInches: 77 },
  SF: { weight: 225, heightInches: 80 },
  PF: { weight: 235, heightInches: 81 },
  C: { weight: 250, heightInches: 83 },
};

const TEAM_FULL_NAMES = {
  ATL: "Atlanta Hawks", BAL: "Baltimore Bullets", BKN: "Brooklyn Nets", BOS: "Boston Celtics",
  BUF: "Buffalo Braves", CAP: "Capital Bullets", CHA: "Charlotte Hornets", CHH: "Charlotte Hornets",
  CHI: "Chicago Bulls", CHS: "Chicago Stags", CIN: "Cincinnati Royals", CLE: "Cleveland Cavaliers",
  DAL: "Dallas Mavericks", DEN: "Denver Nuggets", DET: "Detroit Pistons", FTW: "Fort Wayne Pistons",
  GSW: "Golden State Warriors", HOU: "Houston Rockets", IND: "Indiana Pacers", KCK: "Kansas City Kings",
  LAC: "LA Clippers", LAL: "Los Angeles Lakers", MEM: "Memphis Grizzlies", MIA: "Miami Heat",
  MIL: "Milwaukee Bucks", MIN: "Minnesota Timberwolves", MLH: "Milwaukee Hawks", MNL: "Minneapolis Lakers",
  NJN: "New Jersey Nets", NOH: "New Orleans Hornets", NOJ: "New Orleans Jazz", NOP: "New Orleans Pelicans",
  NYK: "New York Knicks", NYN: "New York Nets", OKC: "Oklahoma City Thunder", ORL: "Orlando Magic",
  PHI: "Philadelphia 76ers", PHW: "Philadelphia Warriors", PHX: "Phoenix Suns", POR: "Portland Trail Blazers",
  ROC: "Rochester Royals", SAC: "Sacramento Kings", SAS: "San Antonio Spurs", SDC: "San Diego Clippers",
  SDR: "San Diego Rockets", SEA: "Seattle SuperSonics", SFW: "San Francisco Warriors", STL: "St. Louis Hawks",
  SYR: "Syracuse Nationals", TOR: "Toronto Raptors", UTA: "Utah Jazz", VAN: "Vancouver Grizzlies",
  WAS: "Washington Wizards", WSB: "Washington Bullets", WSC: "Washington Capitols",
};

const KNOWN_NICKNAMES = {
  "shaquille-o-neal": "Shaq",
  "hakeem-olajuwon": "The Dream",
  "kobe-bryant": "Black Mamba",
  "lebron-james": "King James",
  "magic-johnson": "Magic",
  "kareem-abdul-jabbar": "Kareem",
  "giannis-antetokounmpo": "The Greek Freak",
  "dikembe-mutombo": "Mount Mutombo",
  "manu-ginobili": "Manu",
  "yao-ming": "Yao",
  "zion-williamson": "Zion",
  "dwyane-wade": "D-Wade",
  "carmelo-anthony": "Melo",
  "allen-iverson": "The Answer",
  "isiah-thomas": "Zeke",
  "clyde-drexler": "Clyde the Glide",
  "julius-erving": "Dr. J",
  "karl-malone": "The Mailman",
  "paul-george": "Playoff P",
  "gary-payton": "The Glove",
  "david-robinson": "The Admiral",
  "dennis-rodman": "The Worm",
  "tim-duncan": "The Big Fundamental",
  "paul-pierce": "The Truth",
  "dominique-wilkins": "The Human Highlight Film",
  "rudy-gobert": "The Stifle Tower",
  "kevin-durant": "The Slim Reaper",
};

// Hint 5, priority 3: nba_players.json has no award fields at all, so this
// is a curated (necessarily partial) list of unambiguous major-award
// winners, used only for players who fall through priorities 1-2 -- which,
// since every player has a primary_team, in practice means this and
// everything below it are a defensive fallback rather than a commonly-hit
// path. Only includes players NOT already covered by KNOWN_NICKNAMES above.
const MAJOR_AWARDS = {
  "stephen-curry": "Won the NBA MVP award, including a unanimous selection.",
  "kawhi-leonard": "Won Finals MVP and Defensive Player of the Year.",
  "dirk-nowitzki": "Won the NBA MVP award and a Finals MVP.",
  "steve-nash": "Won the NBA MVP award twice.",
  "russell-westbrook": "Won the NBA MVP award.",
  "james-harden": "Won the NBA MVP award.",
  "larry-bird": "Won the NBA MVP award three times.",
  "wilt-chamberlain": "Won the NBA MVP award multiple times.",
  "moses-malone": "Won the NBA MVP award three times.",
  "bill-walton": "Won the NBA MVP award.",
  "draymond-green": "Won Defensive Player of the Year.",
  "ben-wallace": "Won Defensive Player of the Year multiple times.",
};

function heightPhrase(player) {
  return `${player.height_feet} foot ${player.height_inches_remainder ?? 0}`;
}

function approximateWeight(player) {
  const baseline = POSITION_WEIGHT_BASELINE[player.position] || POSITION_WEIGHT_BASELINE.SF;
  const totalHeightInches = (player.height_feet || 6) * 12 + (player.height_inches_remainder ?? 0);
  const delta = totalHeightInches - baseline.heightInches;
  return Math.round((baseline.weight + delta * 5) / 5) * 5;
}

function decadeDescription(startYear, endYear) {
  if (!startYear || !endYear) return "an earlier era of the league";
  const startDecade = Math.floor(startYear / 10) * 10;
  const endDecade = Math.floor(endYear / 10) * 10;
  const decades = [];
  for (let d = startDecade; d <= endDecade; d += 10) decades.push(`${d}s`);
  if (decades.length === 1) return `the ${decades[0]}`;
  if (decades.length === 2) return `the ${decades.join(" and ")}`;
  return `the ${decades.slice(0, -1).join(", ")}, and ${decades[decades.length - 1]}`;
}

function seasonsPlayed(player) {
  return player.total_seasons || Math.max(1, (player.years_active_end || 0) - (player.years_active_start || 0) + 1);
}

// Hint 2: career length + era, with no team or stat information. Very
// short careers (under 3 seasons) skip the decade description entirely --
// "primarily during the 2020s" is meaningless noise for someone who only
// played one or two seasons.
function hint2Text(player) {
  const seasons = seasonsPlayed(player);
  if (seasons < 3) {
    return `Played ${seasons} season${seasons === 1 ? "" : "s"} in the NBA.`;
  }
  return `Played ${seasons} seasons in the NBA primarily during ${decadeDescription(player.years_active_start, player.years_active_end)}.`;
}

// Hint 3: a real secondary team -- never the primary/most-associated team
// and never simply the first entry in their team history (which for a
// player who started elsewhere and became famous with a later team would
// otherwise give away the more obscure stop instead of narrowing things
// down for people who actually follow roster movement). Falls back to
// allowing the first entry back in for two-team players, since excluding
// both leaves nothing to pick from.
function secondaryTeamName(player) {
  const teams = player.teams || [];
  if (teams.length <= 1) return null;
  const primary = player.primary_team || teams[0];
  const firstEntry = teams[0];
  const strictlyOther = teams.filter((t) => t !== primary && t !== firstEntry);
  const candidate = strictlyOther[0] || teams.find((t) => t !== primary);
  return candidate ? TEAM_FULL_NAMES[candidate] || candidate : null;
}

// Hint 4: a real career-average number, never a vague description. A
// player who is elite in BOTH rebounding and playmaking simultaneously
// (e.g. a modern do-it-all big) gets the combined "well rounded" framing
// ahead of a plain points-per-game line, since that combination is far
// more distinctive than points alone. Otherwise falls through a priority
// chain keyed to whichever stat is that player's signature.
function hint4StatLine(player) {
  const ppg = typeof player.career_ppg === "number" ? player.career_ppg : null;
  const rpg = typeof player.career_rpg === "number" ? player.career_rpg : null;
  const apg = typeof player.career_apg === "number" ? player.career_apg : null;
  const bpg = typeof player.career_bpg === "number" ? player.career_bpg : null;

  if (rpg !== null && rpg > 8 && apg !== null && apg > 6) {
    return `Career averages included ${rpg.toFixed(1)} rebounds and ${apg.toFixed(1)} assists per game.`;
  }
  if (ppg !== null && ppg > 20) {
    return `Career averages included ${ppg.toFixed(1)} points per game.`;
  }
  if (ppg !== null && ppg < 10 && rpg !== null && rpg > 8) {
    return `Career averages included ${rpg.toFixed(1)} rebounds per game.`;
  }
  if (apg !== null && apg > 7) {
    return `Career averages included ${apg.toFixed(1)} assists per game.`;
  }
  if (bpg !== null && bpg > 2.0) {
    return `Career averages included ${bpg.toFixed(1)} blocks per game.`;
  }
  // Nobody clears one of the "signature stat" thresholds above -- still
  // give a real number rather than falling back to vague text.
  return `Career averages included ${(ppg ?? 0).toFixed(1)} points per game.`;
}

// Hint 5: priority cascade, first match wins. Every real player has a
// primary_team, so priority 2 is always reachable -- priorities 3-5 exist
// for defensiveness (and are written to spec) but in practice only ever
// fire for the rare record missing team data.
function hint5Reveal(player) {
  const nickname = KNOWN_NICKNAMES[player.player_id];
  if (nickname) return `Known by the nickname ${nickname}.`;

  const primaryTeamName = TEAM_FULL_NAMES[player.primary_team] || player.primary_team;
  if (primaryTeamName) return `Best known for their time with the ${primaryTeamName}.`;

  const award = MAJOR_AWARDS[player.player_id];
  if (award) return award;

  if (player.draft_round === 1 && player.draft_pick === 1) {
    return "Selected as the number one overall pick in the NBA Draft.";
  }
  if (player.draft_round === 1 && player.draft_pick <= 3) {
    return "Selected with a top-three pick in the NBA Draft.";
  }

  if (player.birth_country && player.birth_country !== "USA") {
    return `Born and raised in ${player.birth_country} before coming to the NBA.`;
  }

  return "One of the most recognizable names of their playing era.";
}

export function generateHints(player) {
  const positionName = POSITION_NAMES[player.position] || "forward";
  const hint1 = `A ${heightPhrase(player)} ${positionName} weighing approximately ${approximateWeight(player)} pounds.`;
  const hint2 = hint2Text(player);

  const other = secondaryTeamName(player);
  const hint3 = other
    ? `During their career spent time with the ${other}.`
    : "Spent their entire career with a single franchise.";

  const hint4 = hint4StatLine(player);
  const hint5 = hint5Reveal(player);

  return [hint1, hint2, hint3, hint4, hint5];
}

export function buildAcceptedAnswers(player) {
  const nameParts = player.name.trim().split(/\s+/);
  const lastName = nameParts[nameParts.length - 1];
  const answers = [player.name.toLowerCase(), lastName.toLowerCase()];
  const nickname = KNOWN_NICKNAMES[player.player_id];
  if (nickname) answers.push(nickname.toLowerCase());
  return [...new Set(answers)];
}

export function isCorrectGuess(guess, acceptedAnswers) {
  if (!guess || typeof guess !== "string") return false;
  const normalized = guess.trim().toLowerCase();
  if (!normalized) return false;
  return acceptedAnswers.some((answer) => {
    const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(normalized) || normalized === answer;
  });
}

// --- Pool filtering ---
// "Legends" has no MVP-award field to draw on in nba_players.json, so
// multiple-All-Star selections stands in as a proxy for "multiple MVP
// caliber" alongside the real Hall of Fame flag.
function filterPool(pool, config) {
  switch (config.poolFilter) {
    case "legends":
      return pool.filter((p) => p.is_hall_of_fame || p.all_star_appearances >= 10);
    case "modern":
      return pool.filter((p) => p.years_active_end >= 2010);
    case "current":
      return pool.filter((p) => p.is_active);
    case "position":
      return pool.filter((p) => p.position === config.position);
    default:
      return pool;
  }
}

// --- Config / state ---

const DEFAULT_CONFIG = {
  rounds: 10,
  buzzStyle: "competitive", // "competitive" | "casual"
  hintTiming: "auto", // "auto" | "host"
  poolFilter: "all", // "all" | "legends" | "modern" | "current" | "position"
  position: null,
  maxHints: 5, // 3, 4, or 5
};

const HINT_TIMER_SECONDS = 20;
const CASUAL_GUESS_SECONDS = 20;
const COMPETITIVE_BUZZ_SECONDS = 10;
const WRONG_GUESS_PENALTY = -100;

export function pointsForHint(hintNumber) {
  return 600 - hintNumber * 100;
}

export function initGameState(settings) {
  const rounds = Math.max(5, Math.min(20, Number(settings.rounds) || DEFAULT_CONFIG.rounds));
  const maxHints = [3, 4, 5].includes(Number(settings.maxHints)) ? Number(settings.maxHints) : DEFAULT_CONFIG.maxHints;
  return {
    config: {
      ...DEFAULT_CONFIG,
      ...settings,
      rounds,
      maxHints,
      buzzStyle: settings.buzzStyle === "casual" ? "casual" : "competitive",
      hintTiming: settings.hintTiming === "host" ? "host" : "auto",
    },
    roundNumber: 1,
    totalRounds: rounds,
    scores: {},
    usedPlayerIds: [],
    roundHistory: [],
    phase: "awaiting_configure", // awaiting_configure | round_active | game_over
    currentRound: null,
  };
}

function pickMysteryPlayer(gameState) {
  const filtered = filterPool(players, gameState.config);
  const pool = filtered.length > 0 ? filtered : players;
  const usedSet = new Set(gameState.usedPlayerIds);
  const unused = pool.filter((p) => !usedSet.has(p.player_id));
  const candidates = unused.length > 0 ? unused : pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function startRound(gameState) {
  const player = pickMysteryPlayer(gameState);
  gameState.usedPlayerIds.push(player.player_id);
  gameState.phase = "round_active";

  gameState.currentRound = {
    player,
    hints: generateHints(player),
    acceptedAnswers: buildAcceptedAnswers(player),
    hintNumber: 1,
    hintRevealedAt: Date.now(),
    subPhase: "open", // "open" (accepting buzzes/guesses) | "buzzed" (competitive, someone answering) | "hint_reveal" (casual, brief pause after a hint's guesses reveal)
    activeBuzzerSocketId: null,
    buzzDeadlineAt: null,
    lockedOutSocketIds: [],
    casualSubmissions: {}, // socketId -> { guess: string|null, passed: boolean, hintNumber, correct: boolean|null }
    lastHintReveal: null,
    resolved: false,
    winners: [], // [{ socketId, hintNumber, points }]
    timedOut: false,
  };
  return gameState.currentRound;
}

function connectedEligibleIds(round, connectedSocketIds) {
  const lockedOut = new Set(round.lockedOutSocketIds);
  return connectedSocketIds.filter((id) => !lockedOut.has(id));
}

// True once every connected, not-locked-out player has either guessed or
// passed on the CURRENT hint in casual mode.
export function allCasualSubmitted(round, connectedSocketIds) {
  const eligible = connectedEligibleIds(round, connectedSocketIds);
  if (eligible.length === 0) return true;
  return eligible.every((id) => {
    const sub = round.casualSubmissions[id];
    return sub && sub.hintNumber === round.hintNumber;
  });
}

export function allLockedOut(round, connectedSocketIds) {
  return connectedEligibleIds(round, connectedSocketIds).length === 0;
}

// Advances to the next hint. Returns false if hints are already exhausted
// (caller should resolve the round with no winner instead).
export function advanceHint(gameState) {
  const round = gameState.currentRound;
  if (round.hintNumber >= gameState.config.maxHints) return false;
  round.hintNumber += 1;
  round.hintRevealedAt = Date.now();
  round.subPhase = "open";
  round.activeBuzzerSocketId = null;
  round.buzzDeadlineAt = null;
  round.lastHintReveal = null;
  return true;
}

export function handleBuzzIn(gameState, socketId) {
  const round = gameState.currentRound;
  if (!round || round.resolved) return { error: "No active round to buzz in on." };
  if (gameState.config.buzzStyle !== "competitive") return { error: "Buzzing in is only available in Competitive mode." };
  if (round.lockedOutSocketIds.includes(socketId)) return { error: "You are locked out for the rest of this round." };
  if (round.subPhase === "buzzed") return { error: "Someone else already buzzed in." };

  round.subPhase = "buzzed";
  round.activeBuzzerSocketId = socketId;
  round.buzzDeadlineAt = Date.now() + COMPETITIVE_BUZZ_SECONDS * 1000;
  return { ok: true, hintNumber: round.hintNumber, deadlineAt: round.buzzDeadlineAt };
}

// Competitive guess: only the active buzzer may submit. Returns whether it
// was correct along with the points delta so the caller can broadcast and
// decide whether to resolve the round or reopen the buzzer.
export function handleCompetitiveGuess(gameState, socketId, guessText) {
  const round = gameState.currentRound;
  if (!round || round.resolved) return { error: "No active round." };
  if (round.subPhase !== "buzzed" || round.activeBuzzerSocketId !== socketId) {
    return { error: "It's not your turn to guess." };
  }

  const correct = isCorrectGuess(guessText, round.acceptedAnswers);
  if (correct) {
    const points = pointsForHint(round.hintNumber);
    gameState.scores[socketId] = (gameState.scores[socketId] || 0) + points;
    round.winners.push({ socketId, hintNumber: round.hintNumber, points });
    round.resolved = true;
    round.subPhase = "resolved";
    return { correct: true, points, hintNumber: round.hintNumber };
  }

  gameState.scores[socketId] = (gameState.scores[socketId] || 0) + WRONG_GUESS_PENALTY;
  round.lockedOutSocketIds.push(socketId);
  round.subPhase = "open";
  round.activeBuzzerSocketId = null;
  round.buzzDeadlineAt = null;
  return { correct: false, points: WRONG_GUESS_PENALTY, hintNumber: round.hintNumber };
}

// Casual guess/pass for the current hint. Multiple players can be correct
// on the same hint (each scores independently).
export function recordCasualSubmission(gameState, socketId, { guess, passed }) {
  const round = gameState.currentRound;
  if (!round || round.resolved) return { error: "No active round." };
  if (gameState.config.buzzStyle !== "casual") return { error: "This action is only available in Casual mode." };
  if (round.lockedOutSocketIds.includes(socketId)) return { error: "You are locked out for the rest of this round." };

  round.casualSubmissions[socketId] = {
    guess: passed ? null : guess ?? null,
    passed: !!passed,
    hintNumber: round.hintNumber,
    correct: null,
  };
  return { ok: true };
}

// Scores every submission made against the current hint, locks out wrong
// guessers, and reports who (if anyone) got it right. Does not itself
// decide whether the round continues -- caller checks the return value.
export function resolveCasualHint(gameState) {
  const round = gameState.currentRound;
  const winners = [];
  const revealSnapshot = {};
  for (const [socketId, sub] of Object.entries(round.casualSubmissions)) {
    if (sub.hintNumber !== round.hintNumber) continue;
    if (sub.passed || !sub.guess) {
      revealSnapshot[socketId] = { passed: true, guess: null, correct: null };
      continue;
    }
    const correct = isCorrectGuess(sub.guess, round.acceptedAnswers);
    sub.correct = correct;
    revealSnapshot[socketId] = { passed: false, guess: sub.guess, correct };
    if (correct) {
      const points = pointsForHint(round.hintNumber);
      gameState.scores[socketId] = (gameState.scores[socketId] || 0) + points;
      winners.push({ socketId, hintNumber: round.hintNumber, points });
    } else {
      gameState.scores[socketId] = (gameState.scores[socketId] || 0) + WRONG_GUESS_PENALTY;
      round.lockedOutSocketIds.push(socketId);
    }
  }
  round.winners.push(...winners);
  round.lastHintReveal = { hintNumber: round.hintNumber, submissions: revealSnapshot };
  if (winners.length > 0) round.resolved = true;
  return { winners };
}

// Ends the round with nobody correct (hints exhausted, or every connected
// player locked out early) -- reveals the answer, awards nothing.
export function resolveRoundUnsolved(gameState) {
  const round = gameState.currentRound;
  round.resolved = true;
  round.subPhase = "resolved";
  round.timedOut = true;
}

export function finalizeRoundHistory(gameState) {
  const round = gameState.currentRound;
  gameState.roundHistory.push({
    round: gameState.roundNumber,
    playerName: round.player.name,
    playerId: round.player.player_id,
    position: round.player.position,
    primaryTeam: round.player.primary_team,
    careerPpg: round.player.career_ppg,
    winners: round.winners,
    lockedOutSocketIds: round.lockedOutSocketIds,
    hintsRevealed: round.hintNumber,
  });
}

export function goToNextRound(gameState) {
  if (gameState.roundNumber >= gameState.totalRounds) {
    gameState.phase = "game_over";
    return false;
  }
  gameState.roundNumber += 1;
  startRound(gameState);
  return true;
}

export const TIMERS = {
  HINT_TIMER_SECONDS,
  CASUAL_GUESS_SECONDS,
  COMPETITIVE_BUZZ_SECONDS,
};
