from bot.store import Link, Notice, Store


def test_luu_doc_lien_ket_va_thong_bao(tmp_path):
    store = Store(str(tmp_path / "bot.db"))
    store.save_link(Link(1, "thue101", "enc", "1002", "Người thuê", "tenant", "active"))
    store.save_link(Link(2, "chutro", "enc", "1001", "Chủ trọ", "landlord", "active"))
    assert store.get_link(1).username == "thue101"

    store.set_link_status(2, "needs_login")
    assert [l.chat_id for l in store.active_links()] == [1]

    store.save_notice(Notice(1, "42", "open", 9, 100.0))
    store.save_notice(Notice(1, "42", "acknowledged", 9, 120.0))
    assert store.get_notice(1, "42").phase == "acknowledged"
    assert len(store.notices_for(1)) == 1

    store.delete_link(1)
    assert store.get_link(1) is None
    assert store.notices_for(1) == []


def test_luu_trang_thai_canh_bao_thiet_bi(tmp_path):
    store = Store(str(tmp_path / "bot.db"))
    store.replace_alerts(5, {"101:offline": (10.0, True), "101:fault:gas": (20.0, False)})
    assert store.get_alerts(5) == {"101:offline": (10.0, True), "101:fault:gas": (20.0, False)}
    store.replace_alerts(5, {})
    assert store.get_alerts(5) == {}
