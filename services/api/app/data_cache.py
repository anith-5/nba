"""
Disk cache for pre-computed NBA data.

Why this exists: stats.nba.com blocks cloud/datacenter IPs, so the deployed
backend can't call the NBA API live. Instead, you run `precompute.py` on your
LOCAL machine (home IP — not blocked), which pulls the data and writes JSON
snapshots into services/api/data_cache/. Those files are committed to git and
ship with the deploy, so the live server serves them without ever calling NBA.

Endpoints read cache-first: if a snapshot exists, use it; otherwise fall back
to a live NBA call (which works locally, fails gracefully in the cloud).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

import pandas as pd

CACHE_DIR = Path(__file__).parent.parent / "data_cache"
CACHE_DIR.mkdir(exist_ok=True)


def _path(name: str) -> Path:
    return CACHE_DIR / name


def exists(name: str) -> bool:
    return _path(name).exists()


def read_json(name: str) -> Optional[dict]:
    p = _path(name)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_json(name: str, obj) -> None:
    _path(name).write_text(json.dumps(obj), encoding="utf-8")


def read_df(name: str) -> Optional[pd.DataFrame]:
    p = _path(name)
    if not p.exists():
        return None
    try:
        df = pd.read_json(p)
        return df if not df.empty else None
    except Exception:
        return None


def write_df(name: str, df: pd.DataFrame) -> None:
    _path(name).write_text(df.to_json(), encoding="utf-8")
