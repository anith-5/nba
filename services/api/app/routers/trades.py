"""Trade validation stub — expand with packages/cba-rules in Phase 2."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/trades", tags=["trades"])


class TradeAsset(BaseModel):
    player_id: int | None = None
    player_name: str | None = None
    salary_millions: float = Field(0, ge=0)


class TradeSide(BaseModel):
    team_id: int
    team_name: str
    sends: list[TradeAsset] = Field(default_factory=list)
    receives: list[TradeAsset] = Field(default_factory=list)


class TradeValidationRequest(BaseModel):
    sides: list[TradeSide] = Field(..., min_length=2, max_length=4)


class TradeGrade(BaseModel):
    championship_impact: str
    future_risk: str
    win_now_grade: str
    long_term_grade: str
    summary: str


class TradeValidationResponse(BaseModel):
    valid: bool
    salary_balanced: bool
    messages: list[str]
    grade: TradeGrade | None = None


@router.post("/validate", response_model=TradeValidationResponse)
def validate_trade(body: TradeValidationRequest):
    messages: list[str] = []
    totals: dict[int, float] = {}

    for side in body.sides:
        sent = sum(a.salary_millions for a in side.sends)
        received = sum(a.salary_millions for a in side.receives)
        totals[side.team_id] = totals.get(side.team_id, 0) + (received - sent)

    # Stub: within 10% aggregate movement across deal
    values = list(totals.values())
    salary_balanced = max(values) - min(values) < 5.0 if values else True

    if not salary_balanced:
        messages.append("Salary movement exceeds stub tolerance ($5M). Full CBA rules coming in Phase 2.")

    valid = salary_balanced and len(body.sides) >= 2
    if valid:
        messages.append("Trade passes stub validation. Connect packages/cba-rules for real CBA logic.")

    grade = None
    if valid:
        total_moved = sum(abs(v) for v in values)
        win_now = "B+" if total_moved > 20 else "B"
        grade = TradeGrade(
            championship_impact="Medium",
            future_risk="Low" if salary_balanced else "High",
            win_now_grade=win_now,
            long_term_grade="B",
            summary="AI front-office grading is a placeholder. Team fit and asset models will be added later.",
        )

    return TradeValidationResponse(
        valid=valid,
        salary_balanced=salary_balanced,
        messages=messages,
        grade=grade,
    )
