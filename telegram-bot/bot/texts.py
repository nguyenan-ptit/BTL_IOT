"""Chữ gửi cho người dùng. Giờ theo giờ Việt Nam, đến phút."""
import re
from datetime import datetime, timedelta, timezone

VN = timezone(timedelta(hours=7))

HAZARD = {"gas": "khí gas/khói", "high_temperature": "nhiệt độ cao", "flame": "lửa"}
OVERALL_ICON = {
    "Cảnh báo": "🔴", "Mất kết nối": "⚪", "Lỗi cảm biến": "🟡",
    "Bảo trì": "🔧", "Bình thường": "🟢", "Chưa có thiết bị": "▫️",
}


def room_name(name: str) -> str:
    """Backend đặt tên dạng "Phòng 101"; tên không có chữ "Phòng" thì thêm vào."""
    return name if re.match(r"(?i)^phòng\s", name) else f"Phòng {name}"


def _parse(iso: str) -> datetime:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(VN)


def clock(iso: str, now: datetime) -> str:
    at = _parse(iso)
    if at.date() == now.astimezone(VN).date():
        return at.strftime("%H:%M")
    return at.strftime("%d/%m %H:%M")


def room_overall(status: dict) -> str:
    node = status.get("node")
    if not node or node.get("lifecycle") in ("registered", "retired"):
        return "Chưa có thiết bị"
    if status.get("activeIncidentId") or status.get("hazardSigns"):
        return "Cảnh báo"
    if node.get("lifecycle") == "maintenance":
        return "Bảo trì"
    if node.get("connectivity") == "offline":
        return "Mất kết nối"
    if any(s.get("health") != "ok" for s in status.get("sensors", [])):
        return "Lỗi cảm biến"
    return "Bình thường"


def _sensor(sensors: list[dict], kind: str) -> str:
    sensor = next((s for s in sensors if s.get("kind") == kind), None)
    if sensor is None:
        return "—"
    if sensor.get("health") != "ok":
        return "lỗi"
    value = sensor.get("value")
    if value is None:
        return "—"
    if kind == "gas":
        return str(value)
    if kind == "temperature":
        return f"{value:.1f}".replace(".", ",") + " °C"
    return "có lửa" if value else "không"


def rooms_message(statuses: list[dict], now: datetime) -> str:
    if not statuses:
        return "Tài khoản của bạn chưa được gán phòng nào."
    lines = []
    for st in statuses:
        overall = room_overall(st)
        lines.append(f"{OVERALL_ICON[overall]} {room_name(st['room']['name'])}: {overall}")
        node = st.get("node")
        if node:
            sensors = st.get("sensors", [])
            lines.append(
                f"   Gas {_sensor(sensors, 'gas')} · Nhiệt {_sensor(sensors, 'temperature')}"
                f" · Lửa {_sensor(sensors, 'flame')}"
            )
            if node.get("lastSeenAt"):
                lines.append(f"   Nhận lúc {clock(node['lastSeenAt'], now)}")
    return "\n".join(lines)


def _signs(incident: dict) -> str:
    signs = [HAZARD.get(s, s) for s in incident.get("signs", [])]
    return ", ".join(signs) if signs else "cảnh báo"


def _measure(incident: dict) -> str:
    m = incident.get("latestMeasurement") or {}
    gas = "lỗi" if m.get("gas") is None else m["gas"]
    temp = "lỗi" if m.get("temperature") is None else f"{m['temperature']:.1f}".replace(".", ",") + " °C"
    flame = "lỗi" if m.get("flame") is None else ("có lửa" if m["flame"] else "không")
    return f"Gas {gas} · Nhiệt {temp} · Lửa {flame}"


def _people(incident: dict) -> str:
    return ", ".join(a["user"]["displayName"] for a in incident.get("acknowledgements", []))


def incident_alert(incident: dict, now: datetime, reminder: bool = False) -> str:
    head = "🔁 NHẮC LẠI" if reminder else "🔥 CẢNH BÁO"
    return (
        f"{head}: {room_name(incident['roomName'])} phát hiện {_signs(incident)}\n"
        f"Từ {clock(incident['startedAt'], now)} · chưa ai tiếp nhận\n{_measure(incident)}"
    )


def incident_acknowledged(incident: dict, now: datetime) -> str:
    return (
        f"🟣 {room_name(incident['roomName'])}: {_signs(incident)} từ {clock(incident['startedAt'], now)}\n"
        f"Đã tiếp nhận: {_people(incident) or 'có người'}"
    )


def incident_recovered(incident: dict, now: datetime) -> str:
    when = clock(incident["recoveredAt"], now) if incident.get("recoveredAt") else ""
    return (
        f"✅ {room_name(incident['roomName'])} đã về bình thường {('lúc ' + when) if when else ''}\n"
        "Kiểm tra tại phòng xong thì bấm Đóng sự cố."
    ).replace("  ", " ")


def incident_closed(incident: dict) -> str:
    by = (incident.get("closedBy") or {}).get("displayName")
    return f"☑️ Sự cố {room_name(incident['roomName'])} đã đóng" + (f" bởi {by}." if by else ".")
