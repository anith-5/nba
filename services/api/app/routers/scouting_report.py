"""AI Scouting Report — stats-based and video biomechanical analysis + PDF export."""

import asyncio
import io
import os
import tempfile
import time
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from nba_api.stats.endpoints import commonplayerinfo, leaguedashplayerstats

from app.claude_client import chat_completion, is_available
from app.video_analyzer import analyze_video, metrics_to_dict, CV_AVAILABLE

router = APIRouter(prefix="/scouting", tags=["scouting"])
SEASON = "2024-25"
SONNET = "claude-sonnet-4-6"
HAIKU  = "claude-haiku-4-5-20251001"

MAX_VIDEO_BYTES = 150 * 1024 * 1024   # 150 MB

# ---------------------------------------------------------------------------
# Claude prompts
# ---------------------------------------------------------------------------

STATS_SYSTEM = """You are a professional NBA scout writing a report for a front office.
Write in the style of a real NBA scouting report: concise, analytical, data-backed.
Structure exactly:

**Overview** (2 sentences — role and value)
**Offensive Profile** (3 bullets)
**Defensive Profile** (2 bullets)
**Best Comparable** (1 historical player with brief reason)
**Outlook** (1 sentence — ceiling/floor)
**Trade Value** (1 sentence)

Be specific. Reference the stats provided. No filler."""


VIDEO_SYSTEM = """You are an elite NBA defensive coordinator writing a scouting report based on video biomechanical analysis.
Structure your response EXACTLY as:

**Threat Level**: X/10

**Scouting Summary** (2-3 sentences describing the player's style based on video evidence)

**Key Tendencies from Video**
• [tendency 1 — with specific biomechanical evidence]
• [tendency 2]
• [tendency 3]
• [tendency 4]

**How to Stop Them — 3 Defensive Keys**

1. **[Strategy Name]**: [2-3 sentence explanation with tactical specifics: positioning, scheme, matchup type]

2. **[Strategy Name]**: [2-3 sentence explanation]

3. **[Strategy Name]**: [2-3 sentence explanation]

**Exploitable Weaknesses**
• [weakness 1 with evidence]
• [weakness 2]

**Matchup Recommendation**: [Which type of defender, specific physical attributes needed]

Be tactical, specific, and actionable. Reference the biomechanical data directly."""


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
        season=SEASON, per_mode_simple="PerGame", timeout=60,
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


def _build_video_prompt(player_name: str, team_context: str, metrics: dict) -> str:
    dom = metrics["dominant_hand"]
    drive = metrics["drive_direction"]
    elbow = metrics["avg_r_elbow_angle"]
    knee  = metrics["avg_knee_bend"]
    jumps = metrics["jump_count"]
    rel   = metrics["release_height"]
    pace  = metrics["movement_pace"]
    lat   = metrics["lateral_quickness"]
    conf  = metrics["confidence"]
    dur   = metrics["duration_seconds"]
    frames = metrics["frames_analyzed"]

    msg = (
        f"Player: {player_name or 'Unknown'}\n"
        f"Video duration: {dur:.0f}s · Frames analyzed: {frames} · Analysis confidence: {conf:.0%}\n\n"
        f"BIOMECHANICAL FINDINGS:\n"
        f"• Dominant/primary dribbling hand: {dom}\n"
        f"• Primary drive direction: {drive}\n"
        f"• Average shooting elbow angle (right arm): {elbow:.0f}° "
        f"(ideal form ≈ 90°; above 110° = mechanical flaw)\n"
        f"• Average knee bend: {knee:.0f}° "
        f"(180° = fully straight; under 150° = deep crouch = athletic)\n"
        f"• Detected jump events (shot attempts): {jumps}\n"
        f"• Release height: {rel}\n"
        f"• Movement pace: {pace}\n"
        f"• Lateral quickness: {lat}\n"
    )
    if team_context:
        msg += f"\nDefending team context: {team_context}\n"
    if metrics.get("analysis_notes"):
        msg += f"\nAnalyst notes: {'; '.join(metrics['analysis_notes'])}\n"

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
    mode   = report_data.get("mode", "stats")
    season = report_data.get("season", SEASON)

    elements.append(Paragraph("HoopIQ Scouting Report", title_style))
    elements.append(Paragraph(f"{player} · {season}", sub_style))
    elements.append(HRFlowable(width="100%", thickness=2, color=GREEN, spaceAfter=12))

    # Metrics table if video mode
    if mode == "video" and report_data.get("metrics"):
        m = report_data["metrics"]
        elements.append(Paragraph("Biomechanical Analysis", h2_style))
        table_data = [
            ["Metric", "Finding"],
            ["Dominant Hand",     m.get("dominant_hand", "—").title()],
            ["Drive Direction",   m.get("drive_direction", "—").replace("-", " ").title()],
            ["Shooting Elbow",    f"{m.get('avg_r_elbow_angle', 0):.0f}° (ideal ≈ 90°)"],
            ["Knee Bend",         f"{m.get('avg_knee_bend', 0):.0f}° (180°=straight)"],
            ["Jump Events",       str(m.get("jump_count", 0))],
            ["Release Height",    m.get("release_height", "—").title()],
            ["Movement Pace",     m.get("movement_pace", "—").title()],
            ["Lateral Quickness", m.get("lateral_quickness", "—").title()],
            ["Confidence",        f"{m.get('confidence', 0):.0%}"],
        ]
        tbl = Table(table_data, colWidths=[2.5 * inch, 4 * inch])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), GREEN),
            ("TEXTCOLOR",  (0, 0), (-1, 0), white),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",   (0, 0), (-1, -1), 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [HexColor("#f8fafc"), HexColor("#f1f5f9")]),
            ("GRID",       (0, 0), (-1, -1), 0.5, GRAY),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        elements.append(tbl)
        elements.append(Spacer(1, 12))

    # Stats table if available
    if report_data.get("stats_used"):
        s = report_data["stats_used"]
        elements.append(Paragraph("Season Statistics", h2_style))
        stats_data = [
            ["PPG", "RPG", "APG", "FG%", "3P%", "TS%", "STL", "BLK"],
            [
                str(s.get("pts", "—")), str(s.get("reb", "—")),
                str(s.get("ast", "—")),
                f"{s.get('fg_pct',0):.1%}", f"{s.get('fg3_pct',0):.1%}",
                f"{s.get('ts_pct',0):.1%}",
                str(s.get("stl", "—")), str(s.get("blk", "—")),
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
        elif line.startswith("• ") or line.startswith("- "):
            elements.append(Paragraph(f"&nbsp;&nbsp;• {line[2:]}", body_style))
        elif line[0].isdigit() and line[1:3] in (". ", ") "):
            elements.append(Paragraph(line, body_style))
        else:
            elements.append(Paragraph(line, body_style))

    elements.append(Spacer(1, 20))
    elements.append(HRFlowable(width="100%", thickness=0.5, color=GRAY))
    elements.append(Paragraph(f"Generated by HoopIQ · {season} · Powered by Claude AI", note_style))

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


@router.post("/video")
async def scouting_report_video(
    video: UploadFile = File(...),
    player_name: str = Form(default=""),
    team_context: str = Form(default=""),
):
    if not is_available():
        raise HTTPException(503, "ANTHROPIC_API_KEY not set in services/api/.env")
    if not CV_AVAILABLE:
        raise HTTPException(
            503,
            "Video analysis requires mediapipe + opencv. "
            "Run: pip install mediapipe opencv-python-headless in the venv.",
        )

    content_type = video.content_type or ""
    if not (content_type.startswith("video/") or video.filename.lower().endswith((".mp4", ".mov", ".avi", ".mkv"))):
        raise HTTPException(400, "File must be a video (mp4, mov, avi, mkv).")

    content = await video.read()
    if len(content) > MAX_VIDEO_BYTES:
        raise HTTPException(413, f"Video too large. Max {MAX_VIDEO_BYTES // (1024*1024)} MB.")

    suffix = os.path.splitext(video.filename or ".mp4")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(content)
        tmp_path = f.name

    try:
        metrics = await asyncio.to_thread(analyze_video, tmp_path)
    except Exception as e:
        os.unlink(tmp_path)
        raise HTTPException(500, f"Video analysis failed: {e}")
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    metrics_dict = metrics_to_dict(metrics)

    prompt = _build_video_prompt(player_name, team_context, metrics_dict)
    try:
        report, tokens = await asyncio.to_thread(
            chat_completion, SONNET, VIDEO_SYSTEM,
            [{"role": "user", "content": prompt}], 900,
        )
    except ValueError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))

    return {
        "mode":        "video",
        "player_name": player_name or "Unknown",
        "season":      SEASON,
        "metrics":     metrics_dict,
        "report":      report,
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
