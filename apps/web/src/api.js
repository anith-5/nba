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
  health: () => request("/health"),
  scoreboard: () => request("/live/scoreboard"),
  teams: () => request("/teams"),
  searchPlayers: (q) => request(`/players/search?q=${encodeURIComponent(q)}`),
  playerProfile: (id) => request(`/players/${id}/profile`),
  predictionStatus: () => request("/predictions/status"),
  setupPrediction: () =>
    request("/predictions/setup", { method: "POST" }),
  predictGame: (body) =>
    request("/predictions/game", { method: "POST", body: JSON.stringify(body) }),
  validateTrade: (body) =>
    request("/trades/validate", { method: "POST", body: JSON.stringify(body) }),
};
