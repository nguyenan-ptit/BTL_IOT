from bot.monitor import Alert, Event, conditions, step

NOW = 1_000.0


def status(connectivity="online", lifecycle="active", gas=("ok", 118), last_seen="2026-11-09T08:00:00+00:00"):
    return {
        "room": {"id": "101", "name": "Phòng 101", "boardingHouseId": "1"},
        "node": {"id": "node01", "code": "Node 101", "lifecycle": lifecycle,
                 "connectivity": connectivity, "lastSeenAt": last_seen},
        "sensors": [
            {"kind": "gas", "health": gas[0], "value": gas[1]},
            {"kind": "temperature", "health": "ok", "value": 30.0},
            {"kind": "flame", "health": "ok", "value": False},
        ],
        "activeIncidentId": None, "hazardSigns": [],
    }


def device(mq2_health="ok"):
    return {"device_id": "node01", "data": {"mq2": {"health": mq2_health}}}


def test_mat_ket_noi_va_loi_cam_bien_duoc_nhan_ra():
    assert conditions(status(connectivity="offline"), None) == {"101:offline"}
    assert conditions(status(gas=("fault", None)), device()) == {"101:fault:gas"}
    assert conditions(status(gas=("ok", 12)), device()) == {"101:fault:gas"}
    assert conditions(status(), device()) == set()


def test_bo_qua_mq2_dang_lam_nong_node_bao_tri_va_node_offline():
    assert conditions(status(gas=("fault", None)), device("warming_up")) == set()
    assert conditions(status(lifecycle="maintenance", connectivity="offline"), None) == set()
    # Node offline thì số đo cũ, không xét lỗi cảm biến.
    assert conditions(status(connectivity="offline", gas=("fault", None)), device()) == {"101:offline"}
    # Node chưa từng gửi dữ liệu thì không báo mất kết nối.
    assert conditions(status(connectivity="offline", last_seen=None), None) == set()


def test_chi_bao_khi_du_thoi_gian_cho_va_bao_mot_lan():
    delays = {"offline": 60, "fault": 30}
    events, state = step({}, {"101:offline"}, NOW, delays)
    assert events == [] and state["101:offline"] == Alert(since=NOW, notified=False)
    events, state = step(state, {"101:offline"}, NOW + 59, delays)
    assert events == []
    events, state = step(state, {"101:offline"}, NOW + 60, delays)
    assert events == [Event("down", "101:offline")]
    events, state = step(state, {"101:offline"}, NOW + 120, delays)
    assert events == []


def test_het_loi_thi_bao_mot_lan_neu_da_bao_truoc_do():
    delays = {"offline": 60, "fault": 30}
    state = {"101:fault:gas": Alert(since=NOW, notified=True), "101:offline": Alert(since=NOW, notified=False)}
    events, state = step(state, set(), NOW + 5, delays)
    assert events == [Event("up", "101:fault:gas")]
    assert state == {}
