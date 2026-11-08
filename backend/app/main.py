from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.accounts import router as accounts_router
from app.api.routes.audit_logs import router as audit_logs_router
from app.api.routes.auth import router as auth_router
from app.api.routes.dashboard import router as dashboard_router
from app.api.routes.device_runtime import router as device_runtime_router
from app.api.routes.devices import router as devices_router
from app.api.routes.health import router as health_router
from app.api.routes.incidents import router as incidents_router
from app.api.routes.rooms import houses_router, router as rooms_router
from app.core.config import settings
from app.core.lifespan import lifespan
from app.db.device_storage import StorageError


app = FastAPI(
    title=settings.app_name,
    description="Backend API for boarding-house fire and gas monitoring",
    version="0.1.0",
    lifespan=lifespan,
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
    return JSONResponse(status_code=exc.status_code, content=body, headers=exc.headers or {})


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


@app.exception_handler(StorageError)
async def storage_failure(request: Request, exc: StorageError):
    if exc.errno == 1062:
        return JSONResponse(status_code=409, content={"detail": "Dữ liệu định danh đã tồn tại."})
    return JSONResponse(status_code=503, content={"detail": "Không truy cập được cơ sở dữ liệu; hãy thử lại."})


app.include_router(dashboard_router)
app.include_router(health_router)
app.include_router(rooms_router)
app.include_router(houses_router)
app.include_router(auth_router)
app.include_router(incidents_router)
app.include_router(audit_logs_router)
app.include_router(accounts_router)
app.include_router(devices_router)
app.include_router(device_runtime_router)
