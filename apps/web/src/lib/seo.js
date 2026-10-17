/*
 * Per-route search metadata.
 *
 * ONE SOURCE OF TRUTH, THREE CONSUMERS
 * ------------------------------------
 * This table feeds the client-side head updater (components/SeoHead.jsx), the
 * build-time prerenderer (scripts/prerender.mjs) and the sitemap generator.
 * Keeping it in one place is the point: the previous arrangement hardcoded a
 * single title and a single canonical into index.html, which a single-page app
 * then served for all twenty-five routes. Every page claimed to be a duplicate
 * of the homepage and every search result read "HoopIQ — NBA Analytics".
 *
 * WRITING THESE
 * -------------
 * Titles are what people decide to click on, so they lead with the thing
 * someone searched for rather than the brand. Google truncates around 60
 * characters and descriptions around 160; both are checked at build time.
 *
 * Head terms ("nba stats") are not winnable against Basketball-Reference and
 * ESPN, so these target the specific thing each page actually does.
 */

export const SITE = {
  name: "HoopIQ",
  origin: "https://hoopiq-nba.com",
  tagline: "NBA Analytics",
  defaultImage: "https://hoopiq-nba.com/og-image.png",
};

export const TITLE_MAX = 62;
export const DESC_MAX = 165;

/** path -> { title, description, h1, blurb, type }
 *  `h1` and `blurb` are what the prerenderer writes into the static HTML so a
 *  crawler sees real content before React runs. They should match what the
 *  page actually renders. */
export const ROUTES = {
  "/": {
    title: "HoopIQ — NBA Analytics, Shot Charts & Player Comparisons",
    description:
      "Free NBA analytics: opponent-adjusted power rankings, shot-quality charts, head-to-head season comparisons, a trade machine and AI scouting reports.",
    h1: "HoopIQ",
    blurb:
      "NBA analytics built on the real numbers — scores, standings, shot charts, player comparisons and AI tools.",
    type: "WebSite",
  },
  "/games": {
    title: "NBA Scores & Today's Games — Live Box Scores",
    description:
      "Today's NBA scoreboard with live scores, game status and box-score detail for every matchup on the slate.",
    h1: "Games",
    blurb: "Live NBA scores and today's slate.",
  },
  "/players": {
    title: "NBA Player Search — Career Stats & Advanced Metrics",
    description:
      "Search any NBA player for career stats, per-game and advanced metrics, shot profile and the analytics tools that cover them.",
    h1: "Player Search",
    blurb: "Search any NBA player for career stats and advanced metrics.",
  },
  "/head-to-head": {
    title: "NBA Head-to-Head Comparison — Compare Any Two Seasons",
    description:
      "Put any two NBA player-seasons side by side: six-axis stat radar, the awards each actually won that year, and real shot charts by zone.",
    h1: "Head-to-Head Comparison",
    blurb:
      "Compare any two NBA player-seasons — stats, accolades and shot charts, side by side.",
  },
  "/power-rankings": {
    title: "NBA Power Rankings — Opponent-Adjusted Team Strength",
    description:
      "All 30 NBA teams ranked by margin of victory adjusted for schedule and venue, plus a Four Factors projection showing who is over- or under-performing.",
    h1: "Power Rankings",
    blurb:
      "All 30 teams ranked by opponent-adjusted strength, with a Four Factors projection alongside.",
  },
  "/shot-quality": {
    title: "NBA Shot Quality & Expected FG% (xFG%) by Player",
    description:
      "Every shot a player took, binned by zone and graded against league expectation — see who finishes above the quality of looks they generate.",
    h1: "Shot Quality xFG%",
    blurb:
      "Hexbin shot charts with actual versus expected field-goal percentage by zone.",
  },
  "/shot-evaluator": {
    title: "NBA Shot Evaluator — Grade Any Shot by Zone & Defender",
    description:
      "Pick a shooter, a defender, a court zone and a closeout distance, and get the expected value of that exact shot.",
    h1: "Shot Evaluator",
    blurb: "Grade any shot by shooter, defender, zone and contest distance.",
  },
  "/clutch": {
    title: "NBA Clutch Ratings — Who Actually Delivers Late",
    description:
      "Clutch-time scoring and efficiency measured against each player's own baseline, so elevation is separated from simply being good.",
    h1: "Clutch DNA",
    blurb: "Who actually elevates in the clutch, measured against their own baseline.",
  },
  "/trajectory": {
    title: "NBA Player Development Tracker & Career Projections",
    description:
      "Match a young player to historical comparables by archetype and production, and project best, median and bust career paths from real outcomes.",
    h1: "Development Tracker",
    blurb: "Historical comparables and career projections for young players.",
  },
  "/scouting": {
    title: "AI NBA Scouting Reports — Any Player, Written to Order",
    description:
      "Generate a full scouting report for any NBA player: offensive and defensive profile, best comparable, outlook and trade value.",
    h1: "AI Scouting",
    blurb: "Full AI-written scouting reports for any NBA player.",
  },
  "/ball-knowledge": {
    title: "Ball Knowledge — NBA Decision-Making Trainer",
    description:
      "66 real half-court situations. The possession freezes, you read the floor and choose — every option graded on expected points per possession.",
    h1: "Ball Knowledge",
    blurb:
      "Let's see if you really have ball knowledge. 66 situations, graded on expected points.",
  },
  "/lineups": {
    title: "NBA Lineup Optimizer — Five-Man Unit Ratings",
    description:
      "Net rating, minutes and efficiency for every five-man unit a team has played, with model-predicted ratings for lineups they have not.",
    h1: "Lineup Optimizer",
    blurb: "Five-man unit ratings and predicted lineup performance.",
  },
  "/defense": {
    title: "NBA Defense Scanner — Find a Team's Weak Spots",
    description:
      "Where each NBA defence concedes shots and efficiency by zone, plus an AI-written plan for attacking it.",
    h1: "Defense Scanner",
    blurb: "Where each NBA defence leaks points, by zone.",
  },
  "/trade": {
    title: "NBA Trade Machine — Salary-Matched Trade Analyzer",
    description:
      "Build NBA trades that satisfy real salary-matching rules, then get a value breakdown and an AI verdict on which side wins.",
    h1: "Trade Machine",
    blurb: "Build salary-legal NBA trades and see who wins the deal.",
  },
  "/predictions": {
    title: "NBA Game Predictor — Win Probability Model",
    description:
      "Model-driven win probability for any NBA matchup, built on team ratings, pace and situational factors.",
    h1: "Game Predictor",
    blurb: "Win probability for any NBA matchup.",
  },
  "/win-prob": {
    title: "NBA Win Probability Calculator — Live Game Odds",
    description:
      "Live win probability for in-progress NBA games, and a calculator for any score, time remaining and possession state.",
    h1: "Win Probability",
    blurb: "Live win probability, and a calculator for any game state.",
  },
  "/draft": {
    title: "NBA Draft Simulator — Run Your Own Draft",
    description:
      "Simulate an NBA draft pick by pick, control any team, and see how boards fall with realistic team needs.",
    h1: "Draft Simulator",
    blurb: "Run a full NBA draft, pick by pick.",
  },
  "/draft-comps": {
    title: "NBA Draft Prospect Comparisons — Pro Comparables",
    description:
      "Match draft prospects to NBA comparables on production and physical profile, with stat radars and shot charts side by side.",
    h1: "Draft Prospect Comps",
    blurb: "Match prospects to NBA comparables on production and profile.",
  },
  "/prospects": {
    title: "International NBA Prospects — Scouting Database",
    description:
      "International prospects with production, archetype and NBA translation, searchable by league and position.",
    h1: "Int'l Prospects",
    blurb: "International prospects and how their game translates.",
  },
  "/rules": {
    title: "NBA Rule Change Simulator — Model Any Rule Change",
    description:
      "Move the three-point line, widen the lane or change the shot clock, and see the projected effect on every player and all 30 teams.",
    h1: "Rule Simulator",
    blurb: "Change a rule and see the effect on every player and team.",
  },
  "/gm": {
    title: "AI GM Assistant — Ask Anything About Your Roster",
    description:
      "Ask roster, cap and strategy questions and get answers grounded in current NBA data.",
    h1: "GM Assistant",
    blurb: "Roster, cap and strategy questions, answered from real data.",
  },
  "/research": {
    title: "NBA Research — Analytics Notes & Findings",
    description:
      "Research notes and findings from the data behind HoopIQ's analytics tools.",
    h1: "Research",
    blurb: "Notes and findings from the data behind these tools.",
  },
  "/sim": {
    title: "NBA Season Simulator — Simulate the Standings",
    description:
      "Simulate the rest of the NBA season and see projected standings, playoff odds and seeding.",
    h1: "Season Simulator",
    blurb: "Simulate the rest of the season.",
  },
  "/arena": {
    title: "HoopIQ Arena — Multiplayer NBA Trivia Games",
    description:
      "Seven multiplayer NBA guessing games — Wordle, Closest To, Five Hints, Hint Auction, Over/Under, Themed Draft and 82-0. Play with friends by room code.",
    h1: "Arena",
    blurb: "Seven multiplayer NBA games. Create a room and share the code.",
  },
  "/privacy": {
    title: "Privacy Policy — HoopIQ",
    description:
      "What HoopIQ collects and what it does not. No accounts, no cookies, no tracking.",
    h1: "Privacy Policy",
    blurb: "What HoopIQ collects, and what it does not.",
    noindexHint: false,
  },
  "/terms": {
    title: "Terms & Conditions — HoopIQ",
    description: "Terms of use for HoopIQ, and the limits of the data and tools provided.",
    h1: "Terms & Conditions",
    blurb: "Terms of use for HoopIQ.",
  },
};

export const ROUTE_PATHS = Object.keys(ROUTES);

export function metaFor(pathname) {
  // Strip a trailing slash so "/trade/" and "/trade" are the same page.
  const clean = pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";
  return ROUTES[clean] || null;
}

export function canonicalFor(pathname) {
  const clean = pathname !== "/" ? pathname.replace(/\/+$/, "") : "/";
  return SITE.origin + (clean === "/" ? "/" : clean);
}

/**
 * Structured data for a route.
 *
 * Breadcrumbs are the part that actually shows up in results — Google renders
 * them in place of the raw URL, which reads better and is worth real clicks.
 * The WebApplication block describes what each tool is; it does not guarantee a
 * rich result but it is what makes one possible.
 */
export function jsonLdFor(pathname) {
  const meta = metaFor(pathname);
  if (!meta) return null;
  const url = canonicalFor(pathname);
  const graph = [];

  if (pathname === "/") {
    graph.push({
      "@type": "WebSite",
      "@id": `${SITE.origin}/#website`,
      url: SITE.origin + "/",
      name: SITE.name,
      description: meta.description,
    });
  } else {
    graph.push({
      "@type": "WebApplication",
      "@id": `${url}#app`,
      url,
      name: meta.h1,
      description: meta.description,
      applicationCategory: "SportsApplication",
      operatingSystem: "Any",
      isPartOf: { "@id": `${SITE.origin}/#website` },
      // Stating the price is what makes "Free" eligible to appear in results.
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    });
    graph.push({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "HoopIQ", item: SITE.origin + "/" },
        { "@type": "ListItem", position: 2, name: meta.h1, item: url },
      ],
    });
  }

  return { "@context": "https://schema.org", "@graph": graph };
}
