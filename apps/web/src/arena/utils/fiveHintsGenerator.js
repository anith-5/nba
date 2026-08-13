// Pure hint-generation logic for Five Hints. Deliberately has no data-file
// import and no side effects -- it just takes a player object (shaped like
// an entry in nba_players.json) and derives text. This lets it run
// identically in the browser (for the Final Results round recap, once a
// round's mystery player has already been revealed) and, as an independently
// maintained but algorithmically-matching copy, in the realtime server
// (services/arena-realtime/src/game-logic/fiveHints.js), which is the one
// that actually decides what a client is allowed to see while a round is
// still live. Duplicated rather than imported across the package boundary
// for the same reason apps/web/src/arena/data/statCategories.js duplicates
// overUnder.js's STAT_CATEGORIES instead of importing it: the frontend and
// the realtime server are separate deployments (Vercel / Render) with no
// shared workspace, so a relative cross-package import would work locally
// and silently break in production.
//
// Difficulty progression: hint 1-2 give no team/stat information at all.
// Hint 3 gives one real but non-primary team. Hint 4 gives a real career
// stat number (never a vague "among the league leaders" description).
// Hint 5 runs a priority cascade (nickname > major award > draft notability
// > statistical rank/record > primary team) and stops at the first one that
// applies. Primary team is deliberately LAST, not second, and is never
// returned bare -- it's always paired with era and, when available, a real
// achievement -- because a bare team name is the same category of
// information as hint 3 and wouldn't actually be an escalation in
// difficulty. See hint5Reveal below.

export const POSITION_NAMES = {
  PG: "point guard",
  SG: "shooting guard",
  SF: "small forward",
  PF: "power forward",
  C: "center",
};

// Rough real-world NBA weight norms by position, in pounds, at a "typical"
// height for that position. nba_players.json has no weight field at all, so
// this derives a plausible approximate figure from position + height rather
// than inventing an exact one -- every hint that uses it is phrased as
// "approximately", never as a precise stat.
const POSITION_WEIGHT_BASELINE = {
  PG: { weight: 185, heightInches: 74 },
  SG: { weight: 205, heightInches: 77 },
  SF: { weight: 225, heightInches: 80 },
  PF: { weight: 235, heightInches: 81 },
  C: { weight: 250, heightInches: 83 },
};

export const TEAM_FULL_NAMES = {
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

// Hint 5, priority 1: a real, widely-recognized nickname -- used directly in
// a sentence, not as a vague "known by a nickname" gesture. Also doubles as
// an accepted guess answer (see buildAcceptedAnswers): if the hint says
// "Known by the nickname The Answer," guessing "the answer" must count.
// Intentionally a short, high-confidence list rather than an attempt at
// full coverage -- players without an entry here fall through to priority 2
// (their primary team), which is always available.
export const KNOWN_NICKNAMES = {
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
  "michael-jordan": "His Airness",
  "larry-bird": "Larry Legend",
  "wilt-chamberlain": "Wilt the Stilt",
  "oscar-robertson": "The Big O",
  "jerry-west": "The Logo",
  "george-gervin": "Iceman",
  "vince-carter": "Vinsanity",
  "tracy-mcgrady": "T-Mac",
  "chris-webber": "C-Webb",
  "alonzo-mourning": "Zo",
  "rasheed-wallace": "Sheed",
  "gilbert-arenas": "Agent Zero",
  "james-harden": "The Beard",
  "stephen-curry": "Chef Curry",
  "nikola-jokic": "The Joker",
  "damian-lillard": "Dame Time",
  "kawhi-leonard": "The Klaw",
  "chris-paul": "CP3",
  "charles-barkley": "The Round Mound of Rebound",
  "kevin-garnett": "The Big Ticket",
  "ben-wallace": "Big Ben",
  "amare-stoudemire": "STAT",
  "jason-williams": "White Chocolate",
  "joel-embiid": "The Process",
  "karl-anthony-towns": "KAT",
  "luka-doncic": "Luka Magic",
  "anthony-edwards": "Ant-Man",
  "shai-gilgeous-alexander": "SGA",
  "victor-wembanyama": "Wemby",
  "demarcus-cousins": "Boogie",
  "klay-thompson": "Splash Brother",
  "jimmy-butler": "Jimmy Buckets",
  "kyrie-irving": "Uncle Drew",
  "anthony-davis": "The Brow",
  "tim-hardaway": "Killer Crossover",
  "reggie-miller": "Miller Time",
  "earl-monroe": "Earl the Pearl",
  "walt-frazier": "Clyde",
  "pete-maravich": "Pistol Pete",
  "connie-hawkins": "The Hawk",
  "willis-reed": "The Captain",
  "artis-gilmore": "The A-Train",
  "dan-issel": "Horse",
  "glenn-robinson": "Big Dog",
  "larry-johnson": "Grandmama",
  "anfernee-hardaway": "Penny",
  "latrell-sprewell": "Spree",
  "donovan-mitchell": "Spida",
  "trae-young": "Ice Trae",
  "shawn-kemp": "The Reign Man",
  "robert-parish": "The Chief",
  "robert-horry": "Big Shot Bob",
  "dan-majerle": "Thunder Dan",
  "mitch-richmond": "Rock",
  "chauncey-billups": "Mr. Big Shot",
  "richard-hamilton": "Rip",
  "kyle-lowry": "Playoff Kyle",
  "pascal-siakam": "Spicy P",
  "john-havlicek": "Hondo",
  "nate-archibald": "Tiny",
  "billy-cunningham": "The Kangaroo Kid",
  "gus-williams": "The Wizard",
  "xavier-mcdaniel": "The X-Man",
  "joe-ingles": "Jingles",
  "rik-smits": "The Dunking Dutchman",
  "sam-perkins": "Big Smooth",
  "nick-van-exel": "Nick the Quick",
  "bryant-reeves": "Big Country",
  "joe-johnson": "Iso Joe",
  "caron-butler": "Tuff Juice",
  "zach-randolph": "Z-Bo",
  "lou-williams": "Sweet Lou",
  "kentavious-caldwell-pope": "KCP",
  "maurice-lucas": "The Enforcer",
  "paul-arizin": "Pitchin' Paul",
  "micheal-ray-richardson": "Sugar",
  "a-c-green": "The Iron Man",
  "dennis-scott": "3-D",
  "cliff-robinson": "Uncle Cliffy",
  "zydrunas-ilgauskas": "Big Z",
  "glen-davis": "Big Baby",
  "marreese-speights": "Mo Buckets",
  "chris-andersen": "Birdman",
  "avery-johnson": "The Little General",
  "vernon-maxwell": "Mad Max",
  "kenny-smith": "The Jet",
  "terry-rozier": "Scary Terry",
  "collin-sexton": "Young Bull",
  "damon-stoudamire": "Mighty Mouse",
  "antonio-mcdyess": "Dice",
  "steve-francis": "Stevie Franchise",
  "cuttino-mobley": "Cat",
  "sasha-vujacic": "The Machine",
  "mehmet-okur": "Memo",
  "goran-dragic": "Dragon",
  "marcin-gortat": "The Polish Hammer",
  "kyle-anderson": "Slo Mo",
  "michael-beasley": "B-Easy",
  "pervis-ellison": "Never Nervous Pervis",
  "baron-davis": "B-Diddy",
  "andrei-kirilenko": "AK-47",
};

// Hint 5, priority 2: real major-award data (MVP, Finals MVP, DPOY, Rookie
// of the Year, Sixth Man of the Year), sourced from each player's `awards`
// field in nba_players.json rather than a hardcoded lookup -- see
// majorAwardHint below. Ordered by prestige, most impressive first, so a
// five-time MVP is described as an MVP winner rather than (say) a one-time
// Rookie of the Year.
function majorAwardHint(player) {
  const awards = player.awards;
  if (!awards) return null;
  if (awards.mvp >= 2) return "Won the NBA Most Valuable Player award multiple times.";
  if (awards.mvp === 1) return "Won the NBA Most Valuable Player award.";
  if (awards.finals_mvp >= 2) return "Won NBA Finals MVP multiple times.";
  if (awards.finals_mvp === 1) return "Won NBA Finals MVP.";
  if (awards.dpoy >= 2) return "Won NBA Defensive Player of the Year multiple times.";
  if (awards.dpoy === 1) return "Won NBA Defensive Player of the Year.";
  if (awards.roy === 1) return "Named NBA Rookie of the Year.";
  if (awards.sixth_man >= 2) return "Won the NBA Sixth Man of the Year award multiple times.";
  if (awards.sixth_man === 1) return "Won the NBA Sixth Man of the Year award.";
  return null;
}

// Hint 5, priority 3: draft notability. The number-one-overall and
// top-three checks are fully data-driven off draft_round/draft_pick.
// FAMOUS_LATE_DRAFT_STORIES is a small curated allow-list for the opposite
// end -- a player drafted very late (or not at all) who nonetheless became
// a genuine star -- since "how late is notably late" and "did they actually
// become notable" aren't things draft_pick alone can answer; only real,
// well-documented stories included.
const FAMOUS_LATE_DRAFT_STORIES = {
  "isaiah-thomas": "Selected with the very last pick in the NBA Draft before becoming an All-Star.",
  "ben-wallace": "Went undrafted before becoming a four-time Defensive Player of the Year.",
};

function draftNotabilityHint(player) {
  if (player.draft_round === 1 && player.draft_pick === 1) {
    return "Selected first overall in the NBA Draft.";
  }
  if (player.draft_round === 1 && player.draft_pick <= 3) {
    return "Selected with a top-three pick in the NBA Draft.";
  }
  return FAMOUS_LATE_DRAFT_STORIES[player.player_id] || null;
}

// Hint 5, priority 4: a real statistical rank or record -- never a raw
// number, since hint 4 already gave one of those. A small curated set of
// verified all-time NBA rankings/records (not computed from this dataset's
// own totals, several of which are marked "approximate") so nothing here is
// a guess -- every entry is a fact that would hold up against the real
// official NBA record book.
const STAT_RANK_CALLOUTS = {
  "elvin-hayes": "Ranks among the top 10 players in NBA history in career rebounds.",
  "nate-thurmond": "Ranks among the top 10 players in NBA history in career rebounds.",
  "john-stockton": "Holds the NBA all-time record for career assists, by a wide margin.",
  "patrick-ewing": "Ranks among the top 10 players in NBA history in career blocked shots.",
  "maurice-cheeks": "Ranks among the top 10 players in NBA history in career steals.",
  "scottie-pippen": "Ranks among the top 10 players in NBA history in career steals.",
  "russell-westbrook":
    "Set the NBA record for most triple-doubles in a single season, and is one of only a handful of players to ever average a triple-double for a full season.",
  "alex-english": "Was the NBA's leading scorer across the entire decade of the 1980s.",
};

// Hint 5, priority 5 (last resort): primary team, but never bare -- always
// paired with era and, when available, a real achievement (championships or
// multiple All-Star selections) or length of tenure, so it never reads as a
// repeat of hint 3's "just a team name" category. Only reached by players
// with no known nickname, no major award, no notable draft story, and no
// curated stat-rank fact -- in practice, credible role players and
// journeymen rather than genuine stars.
function primaryTeamWithContext(player) {
  const primaryTeamName = TEAM_FULL_NAMES[player.primary_team] || player.primary_team;
  if (!primaryTeamName) return "One of the most recognizable names of their playing era.";

  const era = decadeDescription(player.years_active_start, player.years_active_end);
  const championships = player.championships || 0;
  const allStars = player.all_star_appearances || 0;
  // Championships/All-Star nods are career totals, not attributed to a
  // specific team in this data -- primary_team is sometimes a late-career
  // or otherwise arbitrary designation (e.g. a player's title could have
  // come with a different team entirely). Phrased as two adjacent true
  // facts rather than claiming the achievement happened "with" this team,
  // so the hint never asserts something the data can't actually support.
  if (championships > 0) {
    return `An NBA champion (${championships}x) who spent time with the ${primaryTeamName} during ${era}.`;
  }
  if (allStars >= 2) {
    return `A ${allStars}-time All-Star who spent time with the ${primaryTeamName} during ${era}.`;
  }
  if (seasonsPlayed(player) >= 10) {
    return `Spent over a decade in the league, including time with the ${primaryTeamName}, primarily during ${era}.`;
  }
  return `Best remembered for their run with the ${primaryTeamName} during ${era}.`;
}

function heightPhrase(player) {
  const feet = player.height_feet;
  const inches = player.height_inches_remainder ?? 0;
  return `${feet} foot ${inches}`;
}

function approximateWeight(player) {
  const baseline = POSITION_WEIGHT_BASELINE[player.position] || POSITION_WEIGHT_BASELINE.SF;
  const totalHeightInches = (player.height_feet || 6) * 12 + (player.height_inches_remainder ?? 0);
  const delta = totalHeightInches - baseline.heightInches;
  const raw = baseline.weight + delta * 5;
  return Math.round(raw / 5) * 5;
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
// player who started elsewhere and became famous with a later team, e.g. a
// player whose teams array starts with their draft-day team, would
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

// Hint 5: priority cascade, first match wins -- nickname, then a real major
// award, then draft notability, then a verified stat-rank/record fact, and
// only as a last resort a team (always paired with era/achievement so it
// never repeats hint 3's team-only category). Ordered so the vast majority
// of mystery players resolve well before the team fallback.
function hint5Reveal(player) {
  const nickname = KNOWN_NICKNAMES[player.player_id];
  if (nickname) return `Known by the nickname ${nickname}.`;

  const awardLine = majorAwardHint(player);
  if (awardLine) return awardLine;

  const draftLine = draftNotabilityHint(player);
  if (draftLine) return draftLine;

  const statLine = STAT_RANK_CALLOUTS[player.player_id];
  if (statLine) return statLine;

  return primaryTeamWithContext(player);
}

// Returns the 5 hint strings in fixed reveal order, hardest to easiest:
// physical description, era/career length, a non-primary team, a real
// career-stat number, and finally a near-giveaway (nickname, primary team,
// major award, draft position, or birth country -- first that applies).
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

// Accepted answers for a player: full name and last name always count (last
// name must appear as a whole word, so "curry" and "steph curry" both match
// but a bare first name like "stephen" does not); known mononyms/nicknames
// are added on top for players covered by KNOWN_NICKNAMES.
export function buildAcceptedAnswers(player) {
  const nameParts = player.name.trim().split(/\s+/);
  const lastName = nameParts[nameParts.length - 1];
  const answers = [player.name.toLowerCase(), lastName.toLowerCase()];
  const nickname = KNOWN_NICKNAMES[player.player_id];
  if (nickname) answers.push(nickname.toLowerCase());
  return [...new Set(answers)];
}

// Whole-word, case-insensitive containment check against the last name (or
// any accepted nickname) -- "steph curry" and "curry" both match "curry";
// "stephen" alone does not, since it isn't in the accepted list at all.
export function isCorrectGuess(guess, player) {
  if (!guess || typeof guess !== "string") return false;
  const normalized = guess.trim().toLowerCase();
  if (!normalized) return false;
  const accepted = buildAcceptedAnswers(player);
  return accepted.some((answer) => {
    const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(normalized) || normalized === answer;
  });
}
