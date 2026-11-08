from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse


router = APIRouter()
DASHBOARD = Path(__file__).resolve().parents[2] / "static" / "dashboard.html"


@router.get("/", include_in_schema=False)
@router.get("/dashboard", include_in_schema=False)
def dashboard():
    return FileResponse(DASHBOARD, headers={"Cache-Control": "no-store"})
