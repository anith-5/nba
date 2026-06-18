from app.config import settings
"""Player Development Trajectory — two-layer comp matching (archetype + badges)."""

import threading
from fastapi import APIRouter, HTTPException
from nba_api.stats.static import players as static_players

from app import comp_database

router = APIRouter(prefix="/trajectory", tags=["trajectory"])
SEASON = settings.current_season


@router.get("/status")
def trajectory_status():
    return comp_database.get_status()


@router.post("/rebuild")
def trajectory_rebuild():
    """Trigger a manual rebuild of the comp database."""
    if comp_database._is_building:
        return {"status": "already_building"}
    t = threading.Thread(target=comp_database._background_build, daemon=True)
    t.start()
    return {"status": "started", "message": "Comp database rebuilding in background. Check /trajectory/status."}


def _build_projections(comps: list[dict], current_age: int, current_ppg: float) -> dict:
    """
    Best/median/bust projections built from relative PPG deltas of the comps
    (how much each comp grew or declined from the matched age), applied to
    the query player's actual current PPG. Best/bust are determined by each
    comp's own subsequent PPG trajectory — not a hardcoded tier label.
    """
    future_ages = list(range(current_age + 1, 28))

    def total_growth(c):
        base = c["pts_by_age"].get(c.get("matched_age", current_age))
        if not base:
            return 0.0
        future_vals = [v for a, v in c["pts_by_age"].items() if a > c.get("matched_age", current_age)]
        return (max(future_vals) - base) if future_vals else 0.0

    ranked = sorted(comps, key=lambda c: -total_growth(c))
    top_comps = ranked[: max(1, len(ranked) // 2)] or comps
    bust_comps = ranked[max(1, len(ranked) // 2):] or comps

    best_case, median_case, bust_case = {}, {}, {}

    for age in future_ages:
        best_deltas, med_deltas, bust_deltas = [], [], []

        for c in comps:
            base = c["pts_by_age"].get(c.get("matched_age", current_age))
            future = c["pts_by_age"].get(age)
            if base and future:
                delta = future - base
                med_deltas.append(delta)
                if c in top_comps:
                    best_deltas.append(delta)
                if c in bust_comps:
                    bust_deltas.append(delta)

        if best_deltas:
            best_case[str(age)] = round(max(4.0, current_ppg + max(best_deltas)), 1)
        if med_deltas:
            median_case[str(age)] = round(max(4.0, current_ppg + sum(med_deltas) / len(med_deltas)), 1)
        if bust_deltas:
            bust_case[str(age)] = round(max(4.0, current_ppg + min(bust_deltas)), 1)
        else:
            years_out = age - current_age
            bust_case[str(age)] = round(max(4.0, current_ppg * (0.92 ** years_out)), 1)

    # Guarantee ordering: bust <= median <= best at every age
    for age in future_ages:
        key = str(age)
        b, m, bc = bust_case.get(key), median_case.get(key), best_case.get(key)
        if b is not None and m is not None:
            bust_case[key] = min(b, m)
        if m is not None and bc is not None:
            best_case[key] = max(bc, m)

    return {"best_case": best_case, "median": median_case, "bust": bust_case}


@router.get("/player/{player_id}")
def player_trajectory(player_id: int):
    match = next((p for p in static_players.get_players() if p["id"] == player_id), None)
    if not match:
        raise HTTPException(404, "Player not found.")
    pname = match["full_name"]

    db_ready = comp_database.get_database() is not None
    if not db_ready:
        status = comp_database.get_status()
        raise HTTPException(
            503,
            f"Comp database is still building ({status['n_entries']} entries so far). "
            f"Check /trajectory/status and retry shortly.",
        )

    archetype, stats, current_age = comp_database.compute_query_archetype_and_stats(player_id, pname)
    if not stats:
        raise HTTPException(404, "Insufficient career data for this player.")

    # Rebuild age_pts/ast/reb from the player's own entries (for the historical chart)
    entries = comp_database._build_player_entries(pname)
    if not entries:
        raise HTTPException(404, "Insufficient career data for this player.")
    if len(entries) < 2:
        raise HTTPException(422, "Need at least 2 seasons of data to find comps.")

    age_pts = {e["age"]: e["pts_by_age"].get(e["age"]) for e in entries}
    age_pts = {a: v for a, v in age_pts.items() if v is not None}
    age_ast = {e["age"]: e["ast_by_age"].get(e["age"]) for e in entries}
    age_reb = {e["age"]: e["reb_by_age"].get(e["age"]) for e in entries}

    query_badges = comp_database.evaluate_badges(stats)

    comps = comp_database.find_comparables(
        stats, archetype, current_age, k=6,
        exclude_player_id=player_id, exclude_player_name=pname,
    )

    current_ppg = age_pts.get(current_age, 10.0)
    projections = _build_projections(comps, current_age, current_ppg) if comps else {
        "best_case": {}, "median": {}, "bust": {},
    }

    historical = [
        {"age": a, "pts": age_pts[a], "ast": age_ast.get(a), "reb": age_reb.get(a)}
        for a in sorted(age_pts)
    ]

    comps_out = [
        {
            "name":        c["player_name"],
            "player_id":   c.get("player_id"),
            "similarity":  c["similarity"],
            "archetype":   c["archetype"],
            "badges":      c["badges"],
            "matched_age": c.get("matched_age"),
            "pts_at_ages": {str(k): v for k, v in c["pts_by_age"].items()},
        }
        for c in comps[:5]
    ]

    return {
        "player_id":   player_id,
        "player_name": pname,
        "current_age": current_age,
        "archetype":   archetype,
        "badges":      {b: t for b, t in query_badges.items() if t is not None},
        "badges_unavailable": comp_database.UNAVAILABLE_BADGES,
        "historical":  historical,
        "comps":       comps_out,
        "projections": projections,
    }
