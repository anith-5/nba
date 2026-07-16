const POSITION_ADJACENCY = {
  PG: ["SG"],
  SG: ["PG", "SF"],
  SF: ["SG", "PF"],
  PF: ["SF", "C"],
  C: ["PF"],
};

export const ERA_DEFINITIONS = [
  { label: "Classic Era", range: "before 1980" },
  { label: "Showtime Era", range: "1980-1989" },
  { label: "Jordan Era", range: "1990-1999" },
  { label: "Early 2000s", range: "2000-2009" },
  { label: "Analytics Era", range: "2010-2019" },
  { label: "Modern Era", range: "2020-present" },
];
const ERA_ORDER = ERA_DEFINITIONS.map((e) => e.label);

export const STYLE_TAG_DEFINITIONS = [
  { label: "Floor General", description: "Pass-first point guards who prioritize setting up teammates." },
  { label: "Scoring Guard", description: "Shoot-first guards who create their own offense." },
  { label: "3 and D", description: "Wings who shoot threes and defend at a high level." },
  { label: "Wing Scorer", description: "Offense-first forwards who create and finish plays." },
  { label: "Stretch Big", description: "Bigs who shoot from range and space the floor." },
  { label: "Interior Anchor", description: "Defense-first bigs who protect the rim." },
  { label: "Two Way Star", description: "Elite players who contribute significantly on both ends." },
  { label: "Playmaking Big", description: "Bigs who create offense for others as passers." },
];
// Offensive family: Floor General, Scoring Guard, Wing Scorer, Stretch Big.
// Defensive family: 3 and D, Interior Anchor.
// Mixed (count as yellow against anything): Two Way Star, Playmaking Big.
const STYLE_FAMILY = {
  "Floor General": "offense",
  "Scoring Guard": "offense",
  "Wing Scorer": "offense",
  "Stretch Big": "offense",
  "3 and D": "defense",
  "Interior Anchor": "defense",
  "Two Way Star": "mixed",
  "Playmaking Big": "mixed",
};

function tier(diff, greenAt, yellowAt) {
  if (diff <= greenAt) return "green";
  if (diff <= yellowAt) return "yellow";
  return "red";
}
function arrowFor(guessValue, answerValue) {
  if (answerValue > guessValue) return "up"; // answer is higher than the guess
  if (answerValue < guessValue) return "down";
  return null;
}

export const WORDLE_CATEGORIES = [
  { key: "position", label: "Position" },
  { key: "team", label: "Team" },
  { key: "division", label: "Division" },
  { key: "height", label: "Height" },
  { key: "age", label: "Age" },
  { key: "jerseyNumber", label: "Jersey #" },
  { key: "era", label: "Era" },
  { key: "styleTag", label: "Style Tag" },
];

export function scoreGuess(guess, answer) {
  const tiles = {};

  // 1. Position
  let positionColor;
  if (guess.position === answer.position) positionColor = "green";
  else if (POSITION_ADJACENCY[answer.position]?.includes(guess.position)) positionColor = "yellow";
  else positionColor = "red";
  tiles.position = { color: positionColor, value: guess.position, arrow: null };

  // 2. Team (+ conference sub-label) — current team only, live-synced data
  const teamColor =
    guess.team_abbreviation === answer.team_abbreviation
      ? "green"
      : guess.conference === answer.conference
        ? "yellow"
        : "red";
  tiles.team = {
    color: teamColor,
    value: guess.team_abbreviation,
    sublabel: guess.conference?.toUpperCase(),
    arrow: null,
  };

  // 3. Division
  let divisionColor;
  if (guess.division === answer.division) divisionColor = "green";
  else if (guess.conference === answer.conference) divisionColor = "yellow";
  else divisionColor = "red";
  tiles.division = { color: divisionColor, value: guess.division, arrow: null };

  // 4. Height
  const heightDiff = Math.abs(guess.height_total_inches - answer.height_total_inches);
  tiles.height = {
    color: tier(heightDiff, 1, 3),
    value: `${guess.height_feet}'${guess.height_inches}"`,
    arrow: heightDiff === 0 ? null : arrowFor(guess.height_total_inches, answer.height_total_inches),
  };

  // 5. Age
  const ageDiff = Math.abs(guess.age - answer.age);
  tiles.age = {
    color: tier(ageDiff, 2, 5),
    value: guess.age,
    arrow: ageDiff === 0 ? null : arrowFor(guess.age, answer.age),
  };

  // 6. Jersey Number
  const jerseyDiff = Math.abs(guess.jersey_number - answer.jersey_number);
  tiles.jerseyNumber = {
    color: tier(jerseyDiff, 0, 5),
    value: guess.jersey_number,
    arrow: jerseyDiff === 0 ? null : arrowFor(guess.jersey_number, answer.jersey_number),
  };

  // 7. Era
  const eraDiff = Math.abs(ERA_ORDER.indexOf(guess.era_label) - ERA_ORDER.indexOf(answer.era_label));
  tiles.era = { color: tier(eraDiff, 0, 1), value: guess.era_label, arrow: null };

  // 8. Style Tag
  let styleColor;
  if (guess.style_tag === answer.style_tag) styleColor = "green";
  else {
    const guessFamily = STYLE_FAMILY[guess.style_tag];
    const answerFamily = STYLE_FAMILY[answer.style_tag];
    const overlaps = guessFamily === answerFamily || guessFamily === "mixed" || answerFamily === "mixed";
    styleColor = overlaps ? "yellow" : "red";
  }
  tiles.styleTag = { color: styleColor, value: guess.style_tag, arrow: null };

  return tiles;
}

export function isWinningGuess(feedback) {
  return Object.values(feedback).every((tile) => tile.color === "green");
}
