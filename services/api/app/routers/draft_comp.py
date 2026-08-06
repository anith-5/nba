"""Draft prospect comparison — serves pre-computed comparison cards.

Cards are built by the local precompute step (app.draft_comp.precompute_all),
since the underlying scrapes are slow and rate-limited / cloud-blocked. This
router just serves the cached JSON.
"""

from fastapi import APIRouter, HTTPException

from app import draft_comp

router = APIRouter(prefix="/draft-comp", tags=["draft-comp"])


@router.get("/list")
def list_prospects():
    """Curated prospects that have cached comparison cards."""
    return {"prospects": draft_comp.list_available()}


@router.get("/{slug}")
def get_prospect(slug: str):
    """All three comparison cards for one prospect (from cache)."""
    data = draft_comp.get_cached(slug)
    if data is None:
        raise HTTPException(
            404,
            f"No cached comparison for '{slug}'. Run the precompute step locally.",
        )
    return data
