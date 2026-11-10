from datetime import datetime, timezone

from bot.texts import clock, room_overall, rooms_message

NOW = datetime(2026, 11, 9, 8, 0, tzinfo=timezone.utc)  # 15:00 giờ Việt Nam


def status(**kw):
    base = {
        "room": {"id": "101", "name": "Phòng 101", "boardingHouseId": "1"},
        "node": {"id": "node01", "code": "Node phòng 101", "lifecycle": "active",
                 "connectivity": "online", "lastSeenAt": "2026-11-09T07:58:00+00:00"},
        "sensors": [
            {"kind": "gas", "health": "ok", "value": 118},
            {"kind": "temperature", "health": "ok", "value": 30.3},
            {"kind": "flame", "health": "ok", "value": False},
        ],
        "activeIncidentId": None,
        "hazardSigns": [],
    }
    base.update(kw)
    return base


def test_trang_thai_tong_theo_thu_tu_cua_web():
    assert room_overall(status(node=None)) == "Chưa có thiết bị"
    assert room_overall(status(activeIncidentId="5")) == "Cảnh báo"
    node = status()["node"]
    assert room_overall(status(node={**node, "lifecycle": "maintenance"})) == "Bảo trì"
    assert room_overall(status(node={**node, "connectivity": "offline"})) == "Mất kết nối"
    bad = status()["sensors"][:1] + [{"kind": "temperature", "health": "fault", "value": None}]
    assert room_overall(status(sensors=bad)) == "Lỗi cảm biến"
    assert room_overall(status()) == "Bình thường"


def test_tin_tinh_trang_phong_khong_vo_khi_thieu_so_do():
    bad = [{"kind": "gas", "health": "fault", "value": None},
           {"kind": "temperature", "health": "ok", "value": None},
           {"kind": "flame", "health": "fault", "value": None}]
    text = rooms_message([status(sensors=bad), status(node=None, sensors=[])], NOW)
    assert "Phòng 101" in text
    assert "Phòng Phòng" not in text
    assert "lỗi" in text


def test_gio_den_phut():
    assert clock("2026-11-09T07:58:37+00:00", NOW) == "14:58"
    assert clock("2026-11-08T16:30:00+00:00", NOW) == "08/11 23:30"


INCIDENT = {"id": "7", "roomName": "Phòng 101", "signs": ["gas"], "status": "open",
            "startedAt": "2026-11-09T07:50:00+00:00", "recoveredAt": None, "closedAt": None,
            "closedBy": None, "acknowledgements": [],
            "latestMeasurement": {"gas": 700, "temperature": 30.0, "flame": False}}


def test_tin_canh_bao_co_so_114():
    from bot.texts import incident_alert
    assert "114" in incident_alert(INCIDENT, NOW)
    assert "114" in incident_alert(INCIDENT, NOW, reminder=True)


def test_tin_lich_su_su_co():
    from bot.texts import history_message
    closed = {**INCIDENT, "id": "6", "status": "resolved", "recoveredAt": "2026-11-09T07:55:00+00:00",
              "closedAt": "2026-11-09T07:56:00+00:00", "closedBy": {"id": "1", "displayName": "Chủ trọ"}}
    acked = {**INCIDENT, "id": "8", "status": "acknowledged",
             "acknowledgements": [{"user": {"id": "2", "displayName": "An", "role": "tenant"},
                                   "at": "2026-11-09T07:51:00+00:00"}]}
    text = history_message([INCIDENT, acked, closed], NOW)
    assert "chưa ai tiếp nhận" in text
    assert "An" in text
    assert "đóng bởi Chủ trọ" in text
    assert history_message([], NOW) == "Chưa có sự cố nào."


def test_huong_dan_theo_vai_tro():
    from bot.texts import help_message
    guest = help_message(None)
    assert "/login" in guest and "/thucoi" not in guest
    tenant = help_message("tenant")
    assert "/phong" in tenant and "/lichsu" in tenant and "/thucoi" not in tenant
    landlord = help_message("landlord")
    assert "/thucoi" in landlord and "mất kết nối" in landlord


def test_tin_nhac_ghi_nguoi_da_tiep_nhan():
    from bot.texts import incident_alert
    acked = {**INCIDENT, "status": "acknowledged",
             "acknowledgements": [{"user": {"id": "2", "displayName": "An", "role": "tenant"},
                                   "at": "2026-11-09T07:51:00+00:00"}]}
    text = incident_alert(acked, NOW, reminder=True)
    assert "An đã tiếp nhận" in text and "bạn chưa tiếp nhận" in text
    assert "chưa ai tiếp nhận" in incident_alert(INCIDENT, NOW)
