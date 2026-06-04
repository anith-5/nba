"""Player Development Trajectory — historical comps + career projection curves."""

import time
import math
from typing import Optional
from fastapi import APIRouter, HTTPException
from nba_api.stats.endpoints import playercareerstats
from nba_api.stats.static import players as static_players

router = APIRouter(prefix="/trajectory", tags=["trajectory"])
SEASON = "2024-25"

# Curated comp library: {name: {archetype, pts_by_age: {age: pts}, ast_by_age, reb_by_age}}
# Ages represented: 19-27. None = didn't play that year.
COMP_LIBRARY = {
    "LeBron James":            {"archetype": "All-Time Great", "tier": "superstar",   "pts": {18:20.9, 19:27.2, 20:31.4, 21:27.3, 22:30.0, 23:28.4, 24:29.7, 25:26.7, 26:28.0}},
    "Kevin Durant":            {"archetype": "Elite Scorer",   "tier": "superstar",   "pts": {19:20.0, 20:25.3, 21:27.7, 22:28.0, 23:28.0, 24:30.1, 25:32.0, 26:28.1, 27:25.4}},
    "Stephen Curry":           {"archetype": "Elite Shooter",  "tier": "superstar",   "pts": {21:17.5, 22:18.6, 23:22.9, 24:23.8, 25:24.0, 26:30.1, 27:25.3}},
    "Nikola Jokic":            {"archetype": "Playmaking Big", "tier": "superstar",   "pts": {20:10.0, 21:16.7, 22:18.6, 23:20.0, 24:20.2, 25:26.4, 26:26.4, 27:27.1}},
    "Luka Doncic":             {"archetype": "Playmaking Wing","tier": "superstar",   "pts": {19:21.2, 20:28.8, 21:27.7, 22:28.4, 23:32.4, 24:33.9, 25:28.5}},
    "Jayson Tatum":            {"archetype": "Two-Way Wing",   "tier": "star",        "pts": {19:13.9, 20:15.7, 21:23.0, 22:26.4, 23:26.9, 24:30.1, 25:26.9}},
    "Anthony Edwards":         {"archetype": "Athletic Guard", "tier": "star",        "pts": {19:19.3, 20:21.3, 21:24.6, 22:25.9, 23:27.7}},
    "Devin Booker":            {"archetype": "Volume Scorer",  "tier": "star",        "pts": {19:13.8, 20:22.1, 21:24.9, 22:26.1, 23:25.6, 24:26.8, 25:27.8}},
    "Donovan Mitchell":        {"archetype": "Attacking Guard","tier": "star",        "pts": {21:20.5, 22:23.8, 23:26.0, 24:28.3, 25:26.0, 26:31.6}},
    "Ja Morant":               {"archetype": "Athletic PG",    "tier": "star",        "pts": {20:17.8, 21:19.1, 22:27.4, 23:26.2, 24:25.1}},
    "Bam Adebayo":             {"archetype": "Two-Way Big",    "tier": "starter",     "pts": {21:8.9,  22:13.5, 23:15.9, 24:19.9, 25:21.5, 26:20.4}},
    "Draymond Green":          {"archetype": "IQ Big",         "tier": "starter",     "pts": {23:6.0,  24:11.7, 25:11.7, 26:14.0, 27:11.7}},
    "Jimmy Butler":            {"archetype": "Late Bloomer",   "tier": "star",        "pts": {23:8.6,  24:13.1, 25:20.0, 26:23.9, 27:21.3}},
    "Khris Middleton":         {"archetype": "Mid-Level Star", "tier": "starter",     "pts": {22:4.9,  23:12.1, 24:13.4, 25:18.3, 26:17.8, 27:20.8}},
    "Zion Williamson":         {"archetype": "Dominant Scorer","tier": "star",        "pts": {19:22.5, 20:27.0, 21:26.4, 22:25.0}},
    "Anthony Bennett":         {"archetype": "Physical Fwd",   "tier": "bust",        "pts": {19:4.8,  20:6.5,  21:7.0}},
    "Kwame Brown":             {"archetype": "Athletic Big",   "tier": "bust",        "pts": {18:4.5,  19:7.1,  20:7.5,  21:7.8,  22:10.0}},
    "Michael Beasley":         {"archetype": "Scoring Fwd",    "tier": "underachiever","pts": {19:14.3, 20:19.2, 21:13.7, 22:12.1, 23:9.6}},
    "Markelle Fultz":          {"archetype": "PG",             "tier": "underachiever","pts": {19:7.1,  20:13.1, 21:12.1}},
    "Derrick Rose":            {"archetype": "Explosive PG",   "tier": "superstar",   "pts": {20:16.8, 21:20.8, 22:25.0, 23:21.8}},
}


def _sleep():
    time.sleep(0.7)


def _cosine_sim(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x ** 2 for x in a))
    mag_b = math.sqrt(sum(y ** 2 for y in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def _align_to_ages(pts_by_age: dict, ages: list[int]) -> list[float]:
    return [pts_by_age.get(a, 0.0) for a in ages]


@router.get("/player/{player_id}")
def player_trajectory(player_id: int):
    _sleep()
    try:
        career = playercareerstats.PlayerCareerStats(player_id=player_id, timeout=60)
        df = career.get_data_frames()[0]
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"NBA API error: {e}")

    if df.empty:
        raise HTTPException(status_code=404, detail="No career data found.")

    pname = next(
        (p["full_name"] for p in static_players.get_players() if p["id"] == player_id),
        f"Player #{player_id}",
    )

    # Build age → pts mapping
    age_pts = {}
    for _, row in df.iterrows():
        age = int(row.get("PLAYER_AGE", 0))
        gp = int(row.get("GP", 0))
        pts = float(row.get("PTS", 0))
        if age > 0 and gp > 0:
            ppg = round(pts / gp, 1)
            age_pts[age] = ppg

    if not age_pts:
        raise HTTPException(status_code=404, detail="Insufficient career data.")

    current_age = max(age_pts.keys())
    target_vector = [age_pts.get(a, 0.0) for a in range(19, current_age + 1)]

    if len(target_vector) < 2:
        raise HTTPException(status_code=422, detail="Need at least 2 seasons of data to find comps.")

    # Compare to COMP_LIBRARY
    scores = []
    for name, data in COMP_LIBRARY.items():
        comp_ages = list(range(19, current_age + 1))
        comp_vec = _align_to_ages(data["pts"], comp_ages)
        sim = _cosine_sim(target_vector, comp_vec)
        scores.append((name, sim, data))

    scores.sort(key=lambda x: -x[1])
    top_comps = scores[:3]
    worst = scores[-1]

    # Build projection curves (ages current → 27)
    future_ages = list(range(current_age + 1, 28))
    best_case = {}
    median_case = {}
    bust_case = {}

    for age in future_ages:
        best = [d["pts"].get(age) for _, _, d in top_comps if d["pts"].get(age) is not None]
        med_vals = [v for _, _, d in scores[1:4] for v in [d["pts"].get(age)] if v is not None]
        worst_val = [d["pts"].get(age) for _, _, d in [worst] if d["pts"].get(age) is not None]

        best_case[age] = round(max(best), 1) if best else None
        median_case[age] = round(sum(med_vals) / len(med_vals), 1) if med_vals else None
        bust_case[age] = round(min(worst_val), 1) if worst_val else None

    # Historical arc (actual stats)
    historical = [{"age": a, "pts": p} for a, p in sorted(age_pts.items())]

    comps_out = [
        {
            "name": name,
            "similarity": round(sim, 3),
            "archetype": data["archetype"],
            "tier": data["tier"],
            "pts_at_ages": {str(k): v for k, v in data["pts"].items()},
        }
        for name, sim, data in top_comps
    ]

    return {
        "player_id": player_id,
        "player_name": pname,
        "current_age": current_age,
        "historical": historical,
        "comps": comps_out,
        "projections": {
            "best_case": {str(k): v for k, v in best_case.items() if v is not None},
            "median": {str(k): v for k, v in median_case.items() if v is not None},
            "bust": {str(k): v for k, v in bust_case.items() if v is not None},
        },
    }
