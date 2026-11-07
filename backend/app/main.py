
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.health import router as health_router
from app.core.config import settings
from app.api.routes.rooms import houses_router, router as rooms_router
from app.api.routes.auth import router as auth_router
from app.api.routes.incidents import router as incidents_router
from app.api.routes.audit_logs import router as audit_logs_router
from app.api.routes.accounts import router as accounts_router

app = FastAPI(
    title=settings.app_name,
    description="Backend API for boarding-house fire and gas monitoring",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
)


@app.exception_handler(HTTPException)
async def api_http_error(request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict) and isinstance(detail.get("code"), str):
        body = detail
    else:
        codes = {401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT", 422: "VALIDATION_ERROR"}
        body = {"code": codes.get(exc.status_code, "REQUEST_FAILED"), "message": str(detail)}
    headers = exc.headers or {}
    return JSONResponse(status_code=exc.status_code, content=body, headers=headers)


@app.exception_handler(RequestValidationError)
async def api_validation_error(request: Request, exc: RequestValidationError):
    fields = {}
    for error in exc.errors():
        location = ".".join(str(part) for part in error.get("loc", ()) if part != "body")
        if location:
            fields[location] = "Dữ liệu không hợp lệ."
    return JSONResponse(status_code=422, content={
        "code": "VALIDATION_ERROR",
        "message": "Dữ liệu gửi lên không hợp lệ.",
        "fields": fields,
    })

app.include_router(health_router)
app.include_router(rooms_router)
app.include_router(houses_router)
app.include_router(auth_router)
app.include_router(incidents_router)
app.include_router(audit_logs_router)
app.include_router(accounts_router)

@app.get("/")
def root():
    return {"message": "Fire & Gas Monitoring API is running"}
