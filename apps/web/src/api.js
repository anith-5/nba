const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.message || "Request failed");
  }
  return res.json();
}

export const api = {
  // Core
  health: () => request("/health"),
  scoreboard: () => request("/live/scoreboard"),
  teams: () => request("/teams"),
  searchPlayers: (q) => request(`/players/search?q=${encodeURIComponent(q)}`),
  playerProfile: (id) => request(`/players/${id}/profile`),
  validateTrade: (body) =>
    request("/trades/validate", { method: "POST", body: JSON.stringify(body) }),

  // Game Predictor
  predictionStatus: () => request("/predictions/status"),
  setupPrediction: () => request("/predictions/setup", { method: "POST" }),
  predictGame: (body) =>
    request("/predictions/game", { method: "POST", body: JSON.stringify(body) }),

  // Shot Quality xFG%
  shotQuality: (playerId) => request(`/shot-quality/player/${playerId}`),

  // Win Probability
  winProbLive: () => request("/win-probability/live"),
  winProbCalc: (body) =>
    request("/win-probability/calculate", { method: "POST", body: JSON.stringify(body) }),

  // Lineup Optimizer
  lineupsByTeam: (teamId) => request(`/lineups/team/${teamId}`),
  lineupTeams: () => request("/lineups/teams"),

  // Defense Scanner
  defenseVulnerabilities: (teamId) => request(`/defense/team/${teamId}/vulnerabilities`),
  defenseTeams: () => request("/defense/teams"),

  // Player Development Trajectory
  playerTrajectory: (playerId) => request(`/trajectory/player/${playerId}`),

  // Clutch DNA
  clutchLeaderboard: (limit = 25) => request(`/clutch/leaderboard?limit=${limit}`),
  clutchPlayer: (playerId) => request(`/clutch/player/${playerId}`),

  // AI Scouting Report
  scoutingReport: (playerId, teamContext = "") =>
    request(`/scouting/player/${playerId}?team_context=${encodeURIComponent(teamContext)}`, {
      method: "POST",
    }),

  // International Prospects
  prospects: () => request("/prospects/"),
  prospect: (slug) => request(`/prospects/${slug}`),
  searchProspects: (body) =>
    request("/prospects/search", { method: "POST", body: JSON.stringify(body) }),

  // Rule Simulator
  simulateRule: (body) =>
    request("/rules/simulate", { method: "POST", body: JSON.stringify(body) }),
  ruleScenarios: () => request("/rules/scenarios"),

  // GM Assistant
  gmChat: (body) =>
    request("/gm-assistant/chat", { method: "POST", body: JSON.stringify(body) }),
};
