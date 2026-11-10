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


def needs_ack(incident: dict, personal: bool) -> bool:
    """Chat này còn phải tiếp nhận không.

    `personal` (chủ trọ, người thuê): mỗi người bị nhắc tới khi chính mình tiếp nhận.
    Không `personal` (admin, không được tiếp nhận): thôi nhắc khi đã có người tiếp nhận.
    """
    status = incident.get("status")
    if status == "open":
        return True
    return personal and status == "acknowledged" and not incident.get("acknowledgedByMe", False)


def next_action(incident: dict | None, notice: Notice | None, now: float,
                remind_seconds: int, personal: bool = False) -> Action:
    if incident is None:
        return Action.NONE
    phase = notice.phase if notice else None
    if incident.get("closedAt"):
        return Action.MARK_CLOSED if phase not in (None, "closed") else Action.NONE
    if incident.get("recoveredAt"):
        return Action.OFFER_CLOSE if phase not in ("recovered", "closed") else Action.NONE
    if needs_ack(incident, personal):
        if notice is None:
            return Action.SEND_NEW
        if phase == "open" and now - notice.last_sent_at >= remind_seconds:
            return Action.REMIND
        return Action.NONE
    if incident.get("status") == "acknowledged":
        if notice is None:
            return Action.SEND_NEW
        if phase == "open":
            return Action.MARK_ACK
    return Action.NONE
