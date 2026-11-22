from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from app.api.routes.device_runtime import check_control_request
from app.core.legacy_auth import require_roles
from app.services.ota import DEVICE_PATTERN, MAX_IMAGE_BYTES, VERSION_PATTERN

router = APIRouter(prefix="/api")
admin = require_roles("admin")
DEVICE_ID = "^" + DEVICE_PATTERN + "$"
VERSION = "^" + VERSION_PATTERN + "$"
OTA_ID = r"^[a-f0-9]{32}$"


class OtaJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    firmware_id: str = Field(pattern=OTA_ID)


def mqtt_ready(request):
    status = request.app.state.receiver.snapshot()
    return bool(request.app.state.command_worker_ready and status.get("connected") and status.get("ota_connected"))


@router.get("/devices/{device_id}/ota")
def ota_overview(request: Request, device_id: str = Path(pattern=DEVICE_ID), user: dict = Depends(admin)):
    ota = getattr(request.app.state, "ota", None)
    if not ota or not ota.enabled:
        return {"enabled": False, "mqtt_ready": False, "job": None}
    return {"enabled": True, "mqtt_ready": mqtt_ready(request),
            "job": ota.latest_job(device_id, user)}


@router.post("/firmware", status_code=201)
async def upload_firmware(request: Request, device_id: str = Query(pattern=DEVICE_ID),
                          version: str = Query(pattern=VERSION), user: dict = Depends(admin)):
    check_control_request(request, content_type="application/octet-stream")
    ota = request.app.state.ota
    ota.ensure_enabled()
    image = bytearray()
    async for chunk in request.stream():
        if len(image) + len(chunk) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "File firmware vượt quá 1 MiB.")
        image.extend(chunk)
    return await run_in_threadpool(ota.add_release, device_id, version, bytes(image), user)


@router.get("/firmware")
def list_firmware(request: Request, device_id: str = Query(pattern=DEVICE_ID), user: dict = Depends(admin)):
    ota = request.app.state.ota
    ota.ensure_enabled()
    return {"items": ota.list_releases(device_id, user)}


@router.post("/devices/{device_id}/ota", status_code=202)
def start_ota(request: Request, body: OtaJobRequest, device_id: str = Path(pattern=DEVICE_ID),
              user: dict = Depends(admin)):
    check_control_request(request)
    ota = request.app.state.ota
    ota.ensure_enabled()
    if not mqtt_ready(request):
        raise HTTPException(503, "Backend chưa kết nối được các topic OTA.")
    return ota.create_job(device_id, body.firmware_id, user)


@router.get("/ota/jobs/{job_id}")
def get_ota_job(request: Request, job_id: str = Path(pattern=OTA_ID), user: dict = Depends(admin)):
    ota = request.app.state.ota
    ota.ensure_enabled()
    return ota.get_job(job_id, user)


@router.get("/ota/download/{job_id}", include_in_schema=False)
def download_firmware(request: Request, job_id: str = Path(pattern=OTA_ID), token: str = Query(max_length=64)):
    ota = request.app.state.ota
    ota.ensure_enabled()
    image = ota.download_image(job_id, token)
    return Response(image, media_type="application/octet-stream",
                    headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
