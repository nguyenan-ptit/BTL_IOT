"""Báo mất kết nối và lỗi cảm biến cho chủ trọ: hàm thuần, không gọi mạng.

Khoá cảnh báo dạng "<phòng>:offline" hoặc "<phòng>:fault:<cảm biến>".
"""
from dataclasses import dataclass

GAS_MIN_VALID = 20  # cùng quy tắc với web: số đo gas dưới 20 coi là lỗi cảm biến


@dataclass(frozen=True)
class Alert:
    since: float
    notified: bool


@dataclass(frozen=True)
class Event:
    kind: str  # "down" (bắt đầu lỗi) | "up" (hết lỗi)
    key: str


def conditions(status: dict, device: dict | None) -> set[str]:
    """Các điều kiện đang xảy ra ở một phòng. `device` là item /api/devices của node trong phòng."""
    node = status.get("node")
    if not node or node.get("lifecycle") != "active":
        return set()
    room = status["room"]["id"]
    if node.get("connectivity") == "offline":
        return {f"{room}:offline"} if node.get("lastSeenAt") else set()
    data = (device or {}).get("data") or {}
    warming = (data.get("mq2") or {}).get("health") == "warming_up"
    found = set()
    for sensor in status.get("sensors", []):
        kind = sensor.get("kind")
        if kind == "gas" and warming:
            continue
        low_gas = kind == "gas" and sensor.get("value") is not None and sensor["value"] < GAS_MIN_VALID
        if sensor.get("health") != "ok" or low_gas:
            found.add(f"{room}:fault:{kind}")
    return found


def _delay(key: str, delays: dict[str, int]) -> int:
    return delays["offline"] if key.endswith(":offline") else delays["fault"]


def step(state: dict[str, Alert], active: set[str], now: float,
         delays: dict[str, int]) -> tuple[list[Event], dict[str, Alert]]:
    """Cập nhật trạng thái theo các điều kiện đang xảy ra; trả về sự kiện cần báo."""
    events: list[Event] = []
    new_state: dict[str, Alert] = {}
    for key in sorted(active):
        alert = state.get(key) or Alert(since=now, notified=False)
        if not alert.notified and now - alert.since >= _delay(key, delays):
            events.append(Event("down", key))
            alert = Alert(since=alert.since, notified=True)
        new_state[key] = alert
    for key in sorted(set(state) - active):
        if state[key].notified:
            events.append(Event("up", key))
    return events, new_state
