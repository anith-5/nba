"""International Prospect Radar — curated EuroLeague / ACB / NBL prospects."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/prospects", tags=["prospects"])

PROSPECTS = [
    {
        "slug": "nikola-topic",
        "name": "Nikola Topic",
        "age": 19,
        "nationality": "Serbian",
        "league": "Turkish BSL",
        "team": "Crvena zvezda",
        "position": "PG",
        "height": "6'6\"",
        "weight": "195 lbs",
        "nba_archetype": "Pass-First PG",
        "draft_range": "Lottery (Top 10)",
        "status": "Injured – 2025 Draft",
        "stats": {"ppg": 13.4, "apg": 7.2, "rpg": 3.1, "fg_pct": 0.42, "fg3_pct": 0.31, "spg": 1.2},
        "comparable": "Luka Doncic (size + vision)",
        "fit_archetypes": ["Pace-and-Space", "Iso Heavy", "Motion Offense"],
        "strengths": ["Elite court vision", "Pick-and-roll IQ", "Size for PG position", "Late-game composure"],
        "concerns": ["Shot creation off dribble", "NBA-level athleticism", "Injury history (ACL)"],
        "hoop_iq_score": 84,
    },
    {
        "slug": "noa-essengue",
        "name": "Noa Essengue",
        "age": 17,
        "nationality": "French",
        "league": "German Bundesliga",
        "team": "Ratiopharm Ulm",
        "position": "SF/PF",
        "height": "6'9\"",
        "weight": "200 lbs",
        "nba_archetype": "3-and-D Wing",
        "draft_range": "Lottery (Top 5)",
        "status": "Eligible – 2025 Draft",
        "stats": {"ppg": 9.8, "apg": 1.4, "rpg": 4.9, "fg_pct": 0.44, "fg3_pct": 0.35, "spg": 0.9},
        "comparable": "OG Anunoby (defensive upside)",
        "fit_archetypes": ["Pace-and-Space", "Switch-Everything Defense", "Two-Way Rosters"],
        "strengths": ["Freakish length", "Defensive versatility", "Motor", "Shot potential"],
        "concerns": ["Offensive creation", "Youth / inexperience", "Handle at next level"],
        "hoop_iq_score": 79,
    },
    {
        "slug": "hugo-gonzalez",
        "name": "Hugo González",
        "age": 21,
        "nationality": "Spanish",
        "league": "Liga ACB",
        "team": "Joventut Badalona",
        "position": "SG",
        "height": "6'5\"",
        "weight": "190 lbs",
        "nba_archetype": "Spot-Up Shooter",
        "draft_range": "Second Round (30-45)",
        "status": "Available – Free Agent",
        "stats": {"ppg": 14.2, "apg": 2.8, "rpg": 3.4, "fg_pct": 0.47, "fg3_pct": 0.41, "spg": 1.1},
        "comparable": "Duncan Robinson (shooting profile)",
        "fit_archetypes": ["Pace-and-Space", "Off-Ball Systems", "Drive-and-Kick"],
        "strengths": ["Elite catch-and-shoot", "Off-ball movement", "High-IQ decisions"],
        "concerns": ["Shot creation off dribble", "Defensive coverage", "NBA athleticism"],
        "hoop_iq_score": 71,
    },
    {
        "slug": "tristan-vukcevic",
        "name": "Tristan Vukčević",
        "age": 21,
        "nationality": "Montenegrin",
        "league": "EuroLeague",
        "team": "Real Madrid",
        "position": "PF/C",
        "height": "7'0\"",
        "weight": "220 lbs",
        "nba_archetype": "Stretch Big",
        "draft_range": "First Round (15-30)",
        "status": "Available",
        "stats": {"ppg": 8.6, "apg": 1.2, "rpg": 5.1, "fg_pct": 0.50, "fg3_pct": 0.37, "spg": 0.4},
        "comparable": "Kristaps Porzingis (early career)",
        "fit_archetypes": ["Pace-and-Space", "Pick-and-Pop", "Two-Big Lineups"],
        "strengths": ["Size + shooting combo", "Passing for a big", "Mobility"],
        "concerns": ["Defensive anchor ability", "Physicality", "NBA body"],
        "hoop_iq_score": 73,
    },
    {
        "slug": "kai-toews",
        "name": "Kai Toews",
        "age": 22,
        "nationality": "German",
        "league": "EuroLeague",
        "team": "FC Bayern Munich",
        "position": "PG/SG",
        "height": "6'3\"",
        "weight": "185 lbs",
        "nba_archetype": "Combo Guard",
        "draft_range": "Undrafted / Two-way",
        "status": "Available",
        "stats": {"ppg": 11.1, "apg": 5.3, "rpg": 2.9, "fg_pct": 0.43, "fg3_pct": 0.36, "spg": 1.4},
        "comparable": "Alex Caruso (role player ceiling)",
        "fit_archetypes": ["Fast-Break Heavy", "Pick-and-Roll", "Defensive-Minded Systems"],
        "strengths": ["Defensive intensity", "Decision-making", "Transition"],
        "concerns": ["NBA shooting consistency", "Size at PG", "Creation vs elite athletes"],
        "hoop_iq_score": 67,
    },
    {
        "slug": "arnas-velicka",
        "name": "Arnas Vėlička",
        "age": 23,
        "nationality": "Lithuanian",
        "league": "EuroLeague",
        "team": "Žalgiris Kaunas",
        "position": "SF",
        "height": "6'7\"",
        "weight": "205 lbs",
        "nba_archetype": "3-and-D Wing",
        "draft_range": "Second Round",
        "status": "Available",
        "stats": {"ppg": 12.7, "apg": 2.1, "rpg": 4.8, "fg_pct": 0.46, "fg3_pct": 0.38, "spg": 1.3},
        "comparable": "Rokas Jokubaitis (Lithuanian pipeline)",
        "fit_archetypes": ["Pace-and-Space", "Switch-Heavy Defense"],
        "strengths": ["3-point shooting", "Defensive effort", "Transition"],
        "concerns": ["Athleticism gap", "Primary playmaking"],
        "hoop_iq_score": 66,
    },
    {
        "slug": "sidy-cissoko",
        "name": "Sidy Cissoko",
        "age": 20,
        "nationality": "French/Senegalese",
        "league": "Liga ACB",
        "team": "Valencia Basket",
        "position": "SG/SF",
        "height": "6'6\"",
        "weight": "195 lbs",
        "nba_archetype": "Athletic Wing",
        "draft_range": "First Round (20-30)",
        "status": "Eligible – 2025 Draft",
        "stats": {"ppg": 10.3, "apg": 2.3, "rpg": 3.7, "fg_pct": 0.41, "fg3_pct": 0.32, "spg": 1.6},
        "comparable": "Luguentz Dort (defensive archetype)",
        "fit_archetypes": ["Switch-Everything Defense", "Transition-Heavy"],
        "strengths": ["Elite athleticism", "Defensive versatility", "Motor", "Get-to-the-rim"],
        "concerns": ["Shooting consistency", "Half-court offense", "Creation"],
        "hoop_iq_score": 70,
    },
    {
        "slug": "dyson-daniels-int",
        "name": "Ousmane Traore",
        "age": 19,
        "nationality": "French/Malian",
        "league": "NBL (Australia)",
        "team": "Adelaide 36ers",
        "position": "PF",
        "height": "6'8\"",
        "weight": "210 lbs",
        "nba_archetype": "Versatile Big",
        "draft_range": "Second Round",
        "status": "Available",
        "stats": {"ppg": 13.8, "apg": 1.8, "rpg": 7.2, "fg_pct": 0.52, "fg3_pct": 0.29, "spg": 0.8},
        "comparable": "Precious Achiuwa (physical profile)",
        "fit_archetypes": ["Physical Half-Court", "Rebounding-Heavy"],
        "strengths": ["Rebounding", "Finishing at rim", "Physicality"],
        "concerns": ["Perimeter shooting", "Offensive creation", "Defensive scheme IQ"],
        "hoop_iq_score": 62,
    },
    {
        "slug": "nikola-jovic-jr",
        "name": "Stefan Bjelica",
        "age": 21,
        "nationality": "Serbian",
        "league": "EuroLeague",
        "team": "Crvena zvezda",
        "position": "PF/C",
        "height": "6'10\"",
        "weight": "230 lbs",
        "nba_archetype": "Skilled Big",
        "draft_range": "First Round (25-35)",
        "status": "Available",
        "stats": {"ppg": 15.3, "apg": 2.9, "rpg": 6.4, "fg_pct": 0.51, "fg3_pct": 0.36, "spg": 0.7},
        "comparable": "Nikola Jovic (passing big)",
        "fit_archetypes": ["Pace-and-Space", "Pick-and-Pop", "High-Low Offense"],
        "strengths": ["Shooting from mid-range and 3", "Passing IQ", "Screen-setting"],
        "concerns": ["Athleticism ceiling", "Defensive mobility", "Explosiveness"],
        "hoop_iq_score": 75,
    },
    {
        "slug": "lamine-diane",
        "name": "Lamine Diane",
        "age": 27,
        "nationality": "Senegalese/French",
        "league": "EuroLeague",
        "team": "Maccabi Tel Aviv",
        "position": "SF/PF",
        "height": "6'8\"",
        "weight": "215 lbs",
        "nba_archetype": "Scoring Wing",
        "draft_range": "NBA-Ready Vet",
        "status": "Available – Veteran",
        "stats": {"ppg": 19.4, "apg": 2.1, "rpg": 5.8, "fg_pct": 0.48, "fg3_pct": 0.38, "spg": 1.4},
        "comparable": "Nicolas Batum (veteran contributor)",
        "fit_archetypes": ["Drive-and-Kick", "Half-Court Scoring", "Veteran Bench"],
        "strengths": ["Consistent scoring", "Clutch shooting", "Veteran IQ"],
        "concerns": ["Age / prime already passed", "NBA athleticism gap", "Contract demands"],
        "hoop_iq_score": 72,
    },
]

ARCHETYPES = sorted({p["nba_archetype"] for p in PROSPECTS})
LEAGUES = sorted({p["league"] for p in PROSPECTS})
POSITIONS = sorted({p["position"] for p in PROSPECTS})


class SearchRequest(BaseModel):
    archetype: Optional[str] = None
    position: Optional[str] = None
    league: Optional[str] = None
    max_age: Optional[int] = None
    min_hoop_iq: Optional[int] = None


@router.get("/")
def all_prospects():
    return {
        "prospects": PROSPECTS,
        "filters": {"archetypes": ARCHETYPES, "leagues": LEAGUES, "positions": POSITIONS},
        "note": "Demo dataset — production version would integrate SkillCorner / Synergy EuroLeague data.",
    }


@router.get("/{slug}")
def get_prospect(slug: str):
    p = next((p for p in PROSPECTS if p["slug"] == slug), None)
    if not p:
        raise HTTPException(status_code=404, detail="Prospect not found.")
    return p


@router.post("/search")
def search_prospects(body: SearchRequest):
    results = PROSPECTS
    if body.archetype:
        results = [p for p in results if body.archetype.lower() in p["nba_archetype"].lower()]
    if body.position:
        results = [p for p in results if body.position.upper() in p["position"].upper()]
    if body.league:
        results = [p for p in results if body.league.lower() in p["league"].lower()]
    if body.max_age:
        results = [p for p in results if p["age"] <= body.max_age]
    if body.min_hoop_iq:
        results = [p for p in results if p["hoop_iq_score"] >= body.min_hoop_iq]

    results = sorted(results, key=lambda x: -x["hoop_iq_score"])
    return {"results": results, "count": len(results)}
