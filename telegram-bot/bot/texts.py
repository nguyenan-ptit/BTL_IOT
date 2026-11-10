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


def _ack_state(incident: dict) -> str:
    people = _people(incident)
    return f"{people} đã tiếp nhận, bạn chưa tiếp nhận" if people else "chưa ai tiếp nhận"


def incident_alert(incident: dict, now: datetime, reminder: bool = False) -> str:
    head = "🔁 NHẮC LẠI" if reminder else "🔥 CẢNH BÁO"
    return (
        f"{head}: {room_name(incident['roomName'])} phát hiện {_signs(incident)}\n"
        f"Từ {clock(incident['startedAt'], now)} · {_ack_state(incident)}\n{_measure(incident)}\n"
        "Có cháy thật: gọi 114."
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


def _history_state(incident: dict) -> str:
    if incident.get("closedAt"):
        by = (incident.get("closedBy") or {}).get("displayName")
        return f"đã đóng bởi {by}" if by else "đã đóng"
    if incident.get("recoveredAt"):
        return "đã về bình thường, chờ đóng"
    people = _people(incident)
    return f"đã tiếp nhận: {people}" if people else "chưa ai tiếp nhận"


def history_message(incidents: list[dict], now: datetime) -> str:
    if not incidents:
        return "Chưa có sự cố nào."
    lines = ["Sự cố gần đây:"]
    for inc in incidents:
        lines.append(
            f"• {room_name(inc['roomName'])} · {_signs(inc)} · {clock(inc['startedAt'], now)}"
            f" · {_history_state(inc)}"
        )
    return "\n".join(lines)


SENSOR_NAME = {"gas": "gas/khói", "temperature": "nhiệt độ", "flame": "lửa"}


def device_alert(event_kind: str, key: str, room_label: str) -> str:
    """Tin báo mất kết nối / lỗi cảm biến cho chủ trọ."""
    parts = key.split(":")
    if parts[1] == "offline":
        return (f"⚪ {room_label}: node mất kết nối. Phòng này đang không được giám sát."
                if event_kind == "down" else f"🟢 {room_label}: node đã kết nối lại.")
    sensor = SENSOR_NAME.get(parts[2], parts[2])
    return (f"🟡 {room_label}: cảm biến {sensor} báo lỗi. Kiểm tra dây và nguồn của node."
            if event_kind == "down" else f"🟢 {room_label}: cảm biến {sensor} đã hoạt động lại.")


def help_message(role: str | None) -> str:
    """Danh sách lệnh theo vai trò; `None` là chưa đăng nhập."""
    if role is None:
        return (
            "Bot báo cháy/gas nhà trọ.\n\n"
            "/login – đăng nhập bằng tài khoản của website để nhận cảnh báo\n"
            "/help – xem các lệnh"
        )
    lines = [
        "Các lệnh:",
        "/phong – tình trạng các phòng của bạn",
        "/suco – sự cố đang mở",
        "/lichsu – 10 sự cố gần nhất",
    ]
    if role == "landlord":
        lines.append("/thucoi – thử còi và đèn ở một node")
    lines += [
        "/menu – hiện lại bàn phím",
        "/logout – đăng xuất, ngừng nhận cảnh báo",
        "/help – xem các lệnh",
        "",
        "Có sự cố, bot báo ngay và nhắc lại mỗi 10 giây tới khi chính bạn bấm Tiếp nhận. "
        "Hết cảnh báo thì bấm Đóng sự cố.",
    ]
    if role == "landlord":
        lines.append("Bot cũng báo khi node mất kết nối hoặc cảm biến lỗi.")
    if role == "admin":
        lines.append("Tài khoản quản trị viên chỉ nhận thông báo, không tiếp nhận hay đóng sự cố.")
    return "\n".join(lines)
