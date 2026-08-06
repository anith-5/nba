from app.config import settings
"""AI Scouting Report  " stats-based analysis + PDF export."""

import asyncio
import io
import time
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from nba_api.stats.endpoints import commonplayerinfo, leaguedashplayerstats

from app.claude_client import chat_completion, is_available

router = APIRouter(prefix="/scouting", tags=["scouting"])
SEASON = settings.current_season
SONNET = "claude-sonnet-4-6"
HAIKU  = "claude-haiku-4-5-20251001"

# ---------------------------------------------------------------------------
# Claude prompts
# ---------------------------------------------------------------------------

STATS_SYSTEM = """You are a professional NBA scout writing a report for a front office.
Write in the style of a real NBA scouting report: concise, analytical, data-backed.
Structure exactly:

**Overview** (2 sentences  " role and value)
**Offensive Profile** (3 bullets)
**Defensive Profile** (2 bullets)
**Best Comparable** (1 historical player with brief reason)
**Outlook** (1 sentence  " ceiling/floor)
**Trade Value** (1 sentence)

Be specific. Reference the stats provided. No filler."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _sleep():
    time.sleep(0.7)


def _gather_player_stats(player_id: int) -> dict:
    _sleep()
    info_df = commonplayerinfo.CommonPlayerInfo(
        player_id=player_id, timeout=60
    ).get_data_frames()[0]
    if info_df.empty:
        raise HTTPException(404, "Player not found.")
    info = info_df.iloc[0]

    _sleep()
    season_df = leaguedashplayerstats.LeagueDashPlayerStats(
        season=SEASON, per_mode_detailed="PerGame", timeout=60,
    ).get_data_frames()[0]
    pr = season_df[season_df["PLAYER_ID"] == player_id]

    stats = {}
    if not pr.empty:
        r = pr.iloc[0]
        fga = float(r.get("FGA", 1))
        fta = float(r.get("FTA", 0))
        pts = float(r.get("PTS", 0))
        denom = fga + 0.44 * fta
        stats = {
            "gp":     int(r.get("GP", 0)),
            "pts":    round(pts, 1),
            "reb":    round(float(r.get("REB", 0)), 1),
            "ast":    round(float(r.get("AST", 0)), 1),
            "stl":    round(float(r.get("STL", 0)), 1),
            "blk":    round(float(r.get("BLK", 0)), 1),
            "tov":    round(float(r.get("TOV", 0)), 1),
            "fg_pct": round(float(r.get("FG_PCT", 0)), 3),
            "fg3_pct":round(float(r.get("FG3_PCT", 0)), 3),
            "ft_pct": round(float(r.get("FT_PCT", 0)), 3),
            "min":    round(float(r.get("MIN", 0)), 1),
            "ts_pct": round(pts / (2 * denom), 3) if denom > 0 else 0.0,
        }

    return {
        "name":     str(info.get("DISPLAY_FIRST_LAST", f"Player #{player_id}")),
        "age":      int(info.get("SEASON_EXP", 0)) + 18,
        "team":     str(info.get("TEAM_ABBREVIATION", "")),
        "position": str(info.get("POSITION", "")),
        "height":   str(info.get("HEIGHT", "")),
        "country":  str(info.get("COUNTRY", "")),
        "stats":    stats,
    }


def _build_stats_prompt(data: dict, team_context: str) -> str:
    s = data["stats"]
    msg = (
        f"Player: {data['name']}, Age: {data['age']}, Team: {data['team']}, "
        f"Position: {data['position']}, Height: {data['height']}\n"
        f"Season averages: {s.get('pts','N/A')} PPG / {s.get('reb','N/A')} RPG / "
        f"{s.get('ast','N/A')} APG / {s.get('min','N/A')} MPG\n"
        f"Shooting: {s.get('fg_pct',0):.1%} FG / {s.get('fg3_pct',0):.1%} 3P / "
        f"{s.get('ts_pct',0):.1%} TS%\n"
        f"Defense: {s.get('stl','N/A')} STL / {s.get('blk','N/A')} BLK / "
        f"{s.get('tov','N/A')} TOV\nGames played: {s.get('gp','N/A')}"
    )
    if team_context:
        msg += f"\n\nEvaluating fit for: {team_context}"
    return msg


# ---------------------------------------------------------------------------
# PDF generation (reportlab)
# ---------------------------------------------------------------------------

def _generate_pdf(report_data: dict) -> bytes:
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.colors import HexColor, black, white
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
        from reportlab.lib.enums import TA_LEFT, TA_CENTER
    except ImportError:
        raise HTTPException(503, "PDF export requires reportlab. Install it in the venv.")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
    )

    GREEN = HexColor("#22c55e")
    DARK  = HexColor("#0f172a")
    MID   = HexColor("#1e293b")
    GRAY  = HexColor("#64748b")

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("title", fontSize=22, textColor=GREEN, spaceAfter=4, fontName="Helvetica-Bold")
    sub_style   = ParagraphStyle("sub",   fontSize=11, textColor=GRAY,  spaceAfter=12, fontName="Helvetica")
    h2_style    = ParagraphStyle("h2",    fontSize=13, textColor=DARK,  spaceBefore=14, spaceAfter=6, fontName="Helvetica-Bold")
    body_style  = ParagraphStyle("body",  fontSize=10, textColor=black, spaceAfter=6,  fontName="Helvetica", leading=15)
    note_style  = ParagraphStyle("note",  fontSize=9,  textColor=GRAY,  spaceAfter=4,  fontName="Helvetica-Oblique")

    elements = []

    player = report_data.get("player_name", "Unknown Player")
    season = report_data.get("season", SEASON)

    elements.append(Paragraph("HoopIQ Scouting Report", title_style))
    elements.append(Paragraph(f"{player} . {season}", sub_style))
    elements.append(HRFlowable(width="100%", thickness=2, color=GREEN, spaceAfter=12))

    # Stats table if available
    if report_data.get("stats_used"):
        s = report_data["stats_used"]
        elements.append(Paragraph("Season Statistics", h2_style))
        stats_data = [
            ["PPG", "RPG", "APG", "FG%", "3P%", "TS%", "STL", "BLK"],
            [
                str(s.get("pts", "-")), str(s.get("reb", "-")),
                str(s.get("ast", "-")),
                f"{s.get('fg_pct',0):.1%}", f"{s.get('fg3_pct',0):.1%}",
                f"{s.get('ts_pct',0):.1%}",
                str(s.get("stl", "-")), str(s.get("blk", "-")),
            ],
        ]
        st = Table(stats_data, colWidths=[0.82 * inch] * 8)
        st.setStyle(TableStyle([
            ("BACKGROUND",  (0, 0), (-1, 0), MID),
            ("TEXTCOLOR",   (0, 0), (-1, 0), white),
            ("FONTNAME",    (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE",    (0, 0), (-1, -1), 9),
            ("ALIGN",       (0, 0), (-1, -1), "CENTER"),
            ("BACKGROUND",  (0, 1), (-1, 1), HexColor("#f8fafc")),
            ("GRID",        (0, 0), (-1, -1), 0.5, GRAY),
            ("TOPPADDING",  (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(st)
        elements.append(Spacer(1, 12))

    # Report text
    elements.append(Paragraph("Scouting Report", h2_style))
    for line in (report_data.get("report", "") or "").split("\n"):
        if not line.strip():
            elements.append(Spacer(1, 4))
            continue
        if line.startswith("**") and line.endswith("**"):
            elements.append(Paragraph(line.replace("**", ""), h2_style))
        elif line.startswith(" ¢ ") or line.startswith("- "):
            elements.append(Paragraph(f"&nbsp;&nbsp; ¢ {line[2:]}", body_style))
        elif line[0].isdigit() and line[1:3] in (". ", ") "):
            elements.append(Paragraph(line, body_style))
        else:
            elements.append(Paragraph(line, body_style))

    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=GRAY))
    elements.append(Paragraph(f"Generated by HoopIQ . {season} . Powered by Claude AI", note_style))

    doc.build(elements)
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/player/{player_id}")
async def scouting_report_stats(player_id: int, team_context: str = ""):
    if not is_available():
        raise HTTPException(503, "ANTHROPIC_API_KEY not set in services/api/.env")
    try:
        data = await asyncio.to_thread(_gather_player_stats, player_id)
        prompt = _build_stats_prompt(data, team_context)
        report, tokens = await asyncio.to_thread(
            chat_completion, SONNET, STATS_SYSTEM,
            [{"role": "user", "content": prompt}], 600,
        )
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

    return {
        "mode":        "stats",
        "player_id":   player_id,
        "player_name": data["name"],
        "team":        data["team"],
        "season":      SEASON,
        "report":      report,
        "stats_used":  data["stats"],
        "model":       SONNET,
        "tokens_used": tokens,
    }


@router.post("/export-pdf")
async def export_pdf(report_data: dict):
    try:
        pdf_bytes = await asyncio.to_thread(_generate_pdf, report_data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"PDF generation failed: {e}")

    player_name = report_data.get("player_name", "player").replace(" ", "_")
    filename = f"HoopIQ_Scouting_{player_name}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


