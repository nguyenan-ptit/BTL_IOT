
from fastapi import FastAPI

from app.api.routes.health import router as health_router
from app.core.config import settings
from app.api.routes.rooms import router as rooms_router
from app.api.routes.auth import router as auth_router
from app.api.routes.incidents import router as incidents_router
from app.api.routes.audit_logs import router as audit_logs_router
from app.api.routes.accounts import router as accounts_router

app = FastAPI(
    title=settings.app_name,
    description="Backend API for boarding-house fire and gas monitoring",
    version="0.1.0",
)

app.include_router(health_router)
app.include_router(rooms_router)
app.include_router(auth_router)
app.include_router(incidents_router)
app.include_router(audit_logs_router)
app.include_router(accounts_router)

@app.get("/")
def root():
    return {"message": "Fire & Gas Monitoring API is running"}
