"""Quyết định làm gì với một sự cố cho một chat: hàm thuần, không gọi mạng."""
from enum import Enum

from .store import Notice


class Action(Enum):
    SEND_NEW = "send_new"
    REMIND = "remind"
    MARK_ACK = "mark_ack"
    OFFER_CLOSE = "offer_close"
    MARK_CLOSED = "mark_closed"
    NONE = "none"


def next_action(incident: dict | None, notice: Notice | None, now: float,
                remind_seconds: int) -> Action:
    if incident is None:
        return Action.NONE
    phase = notice.phase if notice else None
    if incident.get("closedAt"):
        return Action.MARK_CLOSED if phase not in (None, "closed") else Action.NONE
    if incident.get("recoveredAt"):
        return Action.OFFER_CLOSE if phase not in ("recovered", "closed") else Action.NONE
    status = incident.get("status")
    if status == "open":
        if notice is None:
            return Action.SEND_NEW
        if phase == "open" and now - notice.last_sent_at >= remind_seconds:
            return Action.REMIND
        return Action.NONE
    if status == "acknowledged":
        if notice is None:
            return Action.SEND_NEW
        if phase == "open":
            return Action.MARK_ACK
    return Action.NONE
