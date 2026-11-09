from bot.decide import Action, next_action
from bot.store import Notice

NOW = 1_000.0


def inc(status="open", recovered=None, closed=None):
    return {"id": "42", "status": status, "recoveredAt": recovered, "closedAt": closed}


def notice(phase, sent=NOW - 11):
    return Notice(chat_id=1, incident_id="42", phase=phase, message_id=9, last_sent_at=sent)


def test_su_co_moi_thi_gui():
    assert next_action(inc("open"), None, NOW, 10) == Action.SEND_NEW


def test_chua_ai_tiep_nhan_qua_10_giay_thi_nhac():
    assert next_action(inc("open"), notice("open"), NOW, 10) == Action.REMIND
    assert next_action(inc("open"), notice("open", sent=NOW - 5), NOW, 10) == Action.NONE


def test_co_nguoi_tiep_nhan_thi_ngung_nhac():
    assert next_action(inc("acknowledged"), notice("open"), NOW, 10) == Action.MARK_ACK
    assert next_action(inc("acknowledged"), notice("acknowledged"), NOW, 10) == Action.NONE


def test_da_tiep_nhan_ma_chua_bao_thi_gui_mot_lan():
    assert next_action(inc("acknowledged"), None, NOW, 10) == Action.SEND_NEW


def test_khoi_phuc_thi_moi_dong():
    rec = inc("resolved", recovered="2026-11-09T08:00:00+00:00")
    assert next_action(rec, notice("acknowledged"), NOW, 10) == Action.OFFER_CLOSE
    assert next_action(rec, notice("recovered"), NOW, 10) == Action.NONE


def test_da_dong_thi_sua_tin():
    closed = inc("resolved", recovered="x", closed="2026-11-09T08:05:00+00:00")
    assert next_action(closed, notice("recovered"), NOW, 10) == Action.MARK_CLOSED
    assert next_action(closed, notice("open"), NOW, 10) == Action.MARK_CLOSED


def test_khong_doc_duoc_su_co_thi_khong_lam_gi():
    assert next_action(None, notice("open"), NOW, 10) == Action.NONE
