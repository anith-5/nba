"""Game prediction router - stacked logistic regression ensemble."""

import threading
from typing import Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/predictions", tags=["predictions"])

_predictor = None
_training_lock = threading.Lock()
_is_training = False
_train_error: Optional[str] = None


class PredictRequest(BaseModel):
    home_abbr: str
    away_abbr: str


@router.get("/status")
def model_status():
    return {
        "is_trained": _predictor is not None and _predictor.model.is_fitted,
        "is_training": _is_training,
        "error": _train_error,
    }


@router.post("/setup")
def setup_model():
    global _predictor, _is_training, _train_error

    if not _training_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Model is already training")

    try:
        if _predictor is not None and _predictor.model.is_fitted:
            return {"status": "already_trained", "message": "Model is ready"}

        _is_training = True
        _train_error = None

        from app.predictor import NBAGamePredictor

        p = NBAGamePredictor()
        train_results = p.setup()
        avg_acc = float(np.mean([v["cv_accuracy"] for v in train_results.values()]))
        _predictor = p
        return {
            "status": "trained",
            "accuracy": round(avg_acc, 4),
            "model_details": train_results,
        }

    except Exception as e:
        _train_error = str(e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        _is_training = False
        _training_lock.release()


@router.post("/game")
def predict_game(body: PredictRequest):
    if _predictor is None or not _predictor.model.is_fitted:
        raise HTTPException(
            status_code=400,
            detail="Model not trained. POST to /predictions/setup first.",
        )
    try:
        result = _predictor.predict(
            home_abbr=body.home_abbr,
            away_abbr=body.away_abbr,
            verbose=False,
        )
        return {
            "home_team": result.home_team,
            "away_team": result.away_team,
            "predicted_winner": result.predicted_winner,
            "home_win_prob": result.home_win_prob,
            "away_win_prob": result.away_win_prob,
            "predicted_margin": result.predicted_margin,
            "confidence": result.confidence,
            "model_votes": result.model_votes,
            "features": result.features,
            "model_version": "stacked_lr_v1.0",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
