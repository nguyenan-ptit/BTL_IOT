"""Bot Telegram: đăng nhập bằng tài khoản web, xem phòng, nhận, tiếp nhận và đóng sự cố."""
import logging
import re
import time
from datetime import datetime, timezone

import httpx
from telegram import (BotCommand, InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton,
                      ReplyKeyboardMarkup, Update)
from telegram.error import TelegramError
from telegram.ext import (Application, CallbackQueryHandler, CommandHandler, ContextTypes,
                          ConversationHandler, MessageHandler, filters)

from . import texts
from .backend import ApiError, Backend
from .config import Config
from .crypto import encrypt
from .decide import Action, needs_ack, next_action
from .monitor import Alert, conditions, step
from .sessions import NeedsLogin, Sessions
from .store import Link, Notice, Store

log = logging.getLogger("bot")

BTN_ROOMS = "Tình trạng phòng"
BTN_INCIDENTS = "Sự cố đang mở"
BTN_LOGOUT = "Đăng xuất"
BTN_HISTORY = "Lịch sử sự cố"
BTN_BUZZER = "Thử còi"
COMMANDS = [
    BotCommand("help", "Xem các lệnh"),
    BotCommand("menu", "Hiện menu"),
    BotCommand("phong", "Tình trạng phòng"),
    BotCommand("suco", "Sự cố đang mở"),
    BotCommand("lichsu", "Lịch sử sự cố"),
    BotCommand("thucoi", "Thử còi và đèn (chủ trọ)"),
    BotCommand("login", "Đăng nhập bằng tài khoản website"),
    BotCommand("logout", "Đăng xuất"),
]


def menu_for(role: str) -> ReplyKeyboardMarkup:
    """Bàn phím luôn hiện dưới ô chat. Chủ trọ có thêm nút thử còi."""
    second = [KeyboardButton(BTN_HISTORY)]
    if role == "landlord":
        second.append(KeyboardButton(BTN_BUZZER))
    return ReplyKeyboardMarkup(
        [[KeyboardButton(BTN_ROOMS), KeyboardButton(BTN_INCIDENTS)], second,
         [KeyboardButton(BTN_LOGOUT)]],
        resize_keyboard=True, is_persistent=True,
    )
ASK_USERNAME, ASK_PASSWORD = range(2)
OUTAGE_NOTIFY_S = 120


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _deps(context: ContextTypes.DEFAULT_TYPE) -> tuple[Config, Store, Backend, Sessions]:
    d = context.application.bot_data
    return d["config"], d["store"], d["backend"], d["sessions"]


def _incident_buttons(context, incident_id: str, action: str | None) -> InlineKeyboardMarkup:
    """Nút cho tin sự cố: Tiếp nhận hoặc Đóng sự cố (nếu được phép), và Mở trên web."""
    config = context.application.bot_data["config"]
    rows = []
    if action == "ack":
        rows.append([InlineKeyboardButton("Tiếp nhận", callback_data=f"ack:{incident_id}")])
    elif action == "close":
        rows.append([InlineKeyboardButton("Đóng sự cố", callback_data=f"close:{incident_id}")])
    rows.append([InlineKeyboardButton("Mở trên web", url=f"{config.web_base_url}/su-co/{incident_id}")])
    return InlineKeyboardMarkup(rows)


def _can_act(link: Link) -> bool:
    # Backend không cho quản trị viên tiếp nhận hay đóng sự cố.
    return link.role in ("landlord", "tenant")


# ---------- Lệnh và đăng nhập ----------

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    _, store, _, _ = _deps(context)
    link = store.get_link(update.effective_chat.id)
    if link and link.status == "active":
        await update.message.reply_text(
            f"Bạn đang đăng nhập là {link.display_name}.\n\n{texts.help_message(link.role)}",
            reply_markup=menu_for(link.role))
        return
    await update.message.reply_text(texts.help_message(None))


async def show_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    _, store, _, _ = _deps(context)
    link = store.get_link(update.effective_chat.id)
    active = link is not None and link.status == "active"
    await update.message.reply_text(texts.help_message(link.role if active else None),
                                    reply_markup=menu_for(link.role) if active else None)


async def login_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("Nhập tên đăng nhập của website:")
    return ASK_USERNAME


async def login_username(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data["username"] = update.message.text.strip()
    await update.message.reply_text("Nhập mật khẩu. Tin nhắn chứa mật khẩu sẽ được xoá ngay sau khi gửi.")
    return ASK_PASSWORD


async def login_password(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    config, store, backend, sessions = _deps(context)
    password = update.message.text
    chat_id = update.effective_chat.id
    try:
        await update.message.delete()
    except TelegramError:
        log.warning("Không xoá được tin chứa mật khẩu ở chat %s", chat_id)
    username = context.user_data.pop("username", "")
    try:
        result = await backend.login(username, password)
    except ApiError as error:
        await context.bot.send_message(chat_id, f"Không đăng nhập được: {error.message} Gõ /login để thử lại.")
        return ConversationHandler.END
    except httpx.HTTPError:
        await context.bot.send_message(chat_id, "Không kết nối được hệ thống. Thử lại sau ít phút.")
        return ConversationHandler.END
    user = result["user"]
    store.save_link(Link(chat_id, username, encrypt(config.secret_key, password), user["id"],
                         user.get("displayName") or username, user["role"], "active"))
    sessions.forget(chat_id)
    # help_message đã có câu dành cho quản trị viên, nên không thêm ghi chú riêng.
    await context.bot.send_message(
        chat_id, f"Đã đăng nhập: {user.get('displayName') or username}. Bot sẽ báo khi có sự cố."
        f"\n\n{texts.help_message(user['role'])}",
        reply_markup=menu_for(user["role"]))
    return ConversationHandler.END


async def login_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.pop("username", None)
    await update.message.reply_text("Đã huỷ đăng nhập.")
    return ConversationHandler.END


async def logout(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    _, store, _, sessions = _deps(context)
    store.delete_link(update.effective_chat.id)
    sessions.forget(update.effective_chat.id)
    await update.message.reply_text("Đã đăng xuất. Bot sẽ không gửi cảnh báo cho bạn nữa.")


async def _linked(update: Update, context: ContextTypes.DEFAULT_TYPE) -> Link | None:
    _, store, _, _ = _deps(context)
    link = store.get_link(update.effective_chat.id)
    if link is None or link.status != "active":
        await context.bot.send_message(update.effective_chat.id, "Bạn chưa đăng nhập. Gõ /login.")
        return None
    return link


# ---------- Menu ----------

async def show_rooms(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    link = await _linked(update, context)
    if not link:
        return
    _, _, _, sessions = _deps(context)
    try:
        statuses = await sessions.call(link, "GET", "/api/rooms/status")
    except NeedsLogin:
        await update.message.reply_text("Mật khẩu đã đổi hoặc tài khoản bị khoá. Gõ /login để đăng nhập lại.")
        return
    except (ApiError, httpx.HTTPError):
        await update.message.reply_text("Không lấy được tình trạng phòng. Thử lại sau.")
        return
    await update.message.reply_text(texts.rooms_message(statuses, _now()), reply_markup=menu_for(link.role))


async def show_incidents(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    link = await _linked(update, context)
    if not link:
        return
    _, _, _, sessions = _deps(context)
    try:
        incidents = await sessions.call(link, "GET", "/api/incidents/active")
    except NeedsLogin:
        await update.message.reply_text("Mật khẩu đã đổi hoặc tài khoản bị khoá. Gõ /login để đăng nhập lại.")
        return
    except (ApiError, httpx.HTTPError):
        await update.message.reply_text("Không lấy được danh sách sự cố. Thử lại sau.")
        return
    if not incidents:
        await update.message.reply_text("Không có sự cố nào đang mở.", reply_markup=menu_for(link.role))
        return
    for incident in incidents:
        if needs_ack(incident, _can_act(link)):
            markup = _incident_buttons(context, incident["id"], "ack" if _can_act(link) else None)
            await update.message.reply_text(texts.incident_alert(incident, _now()), reply_markup=markup)
        else:
            await update.message.reply_text(texts.incident_acknowledged(incident, _now()),
                                            reply_markup=_incident_buttons(context, incident["id"], None))


# ---------- Nút bấm ----------

async def on_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    match = re.fullmatch(r"(ack|close):(\d+)", query.data or "")
    if not match:
        await query.answer()
        return
    _, store, _, sessions = _deps(context)
    link = store.get_link(query.message.chat.id)
    if link is None or link.status != "active":
        await query.answer("Bạn chưa đăng nhập. Gõ /login.", show_alert=True)
        return
    kind, incident_id = match.groups()
    path = f"/api/incidents/{incident_id}/" + ("acknowledge" if kind == "ack" else "resolve")
    try:
        await sessions.call(link, "POST", path)
        incident = await sessions.call(link, "GET", f"/api/incidents/{incident_id}")
    except NeedsLogin:
        await query.answer("Mật khẩu đã đổi hoặc tài khoản bị khoá. Gõ /login.", show_alert=True)
        return
    except ApiError as error:
        await query.answer(error.message or "Không thực hiện được.", show_alert=True)
        if error.code == "INCIDENT_ALREADY_RESOLVED":
            await query.edit_message_reply_markup(None)
        return
    except httpx.HTTPError:
        await query.answer("Không kết nối được hệ thống. Thử lại.", show_alert=True)
        return
    now = _now()
    if kind == "ack":
        await query.answer("Đã tiếp nhận.")
        await query.edit_message_text(texts.incident_acknowledged(incident, now))
        store.save_notice(Notice(link.chat_id, incident_id, "acknowledged",
                                 query.message.message_id, time.time()))
    else:
        await query.answer("Đã đóng sự cố.")
        await query.edit_message_text(texts.incident_closed(incident))
        store.delete_notice(link.chat_id, incident_id)


# ---------- Hỏi backend định kỳ ----------

async def _send(context, chat_id: int, text: str, markup=None) -> int | None:
    try:
        message = await context.bot.send_message(chat_id, text, reply_markup=markup)
        return message.message_id
    except TelegramError as error:
        log.warning("Không gửi được tin tới chat %s: %s", chat_id, error)
        return None


async def _edit(context, chat_id: int, message_id: int | None, text: str | None = None) -> bool:
    if message_id is None:
        return False
    try:
        if text is None:
            await context.bot.edit_message_reply_markup(chat_id, message_id, reply_markup=None)
        else:
            await context.bot.edit_message_text(text, chat_id, message_id)
        return True
    except TelegramError:
        return False


async def _handle(context, link: Link, incident: dict, store: Store, config: Config) -> None:
    notice = store.get_notice(link.chat_id, incident["id"])
    action = next_action(incident, notice, time.time(), config.remind_seconds, personal=_can_act(link))
    now = _now()
    chat = link.chat_id
    if action == Action.SEND_NEW:
        if needs_ack(incident, _can_act(link)):
            mid = await _send(context, chat, texts.incident_alert(incident, now),
                              _incident_buttons(context, incident["id"], "ack" if _can_act(link) else None))
            phase = "open"
        else:
            mid = await _send(context, chat, texts.incident_acknowledged(incident, now),
                              _incident_buttons(context, incident["id"], None))
            phase = "acknowledged"
        store.save_notice(Notice(chat, incident["id"], phase, mid, time.time()))
    elif action == Action.REMIND:
        await _edit(context, chat, notice.message_id)  # bỏ nút ở tin cũ, chỉ giữ nút ở tin mới nhất
        mid = await _send(context, chat, texts.incident_alert(incident, now, reminder=True),
                          _incident_buttons(context, incident["id"], "ack" if _can_act(link) else None))
        store.save_notice(Notice(chat, incident["id"], "open", mid, time.time()))
    elif action == Action.MARK_ACK:
        text = texts.incident_acknowledged(incident, now)
        mid = notice.message_id
        if not await _edit(context, chat, mid, text):
            mid = await _send(context, chat, text)
        store.save_notice(Notice(chat, incident["id"], "acknowledged", mid, time.time()))
    elif action == Action.OFFER_CLOSE:
        if notice:
            await _edit(context, chat, notice.message_id)
        mid = await _send(context, chat, texts.incident_recovered(incident, now),
                          _incident_buttons(context, incident["id"], "close" if _can_act(link) else None))
        store.save_notice(Notice(chat, incident["id"], "recovered", mid, time.time()))
    elif action == Action.MARK_CLOSED:
        text = texts.incident_closed(incident)
        if not await _edit(context, chat, notice.message_id, text):
            await _send(context, chat, text)
        store.delete_notice(chat, incident["id"])


async def _poll_link(context, link: Link, store: Store, sessions: Sessions, config: Config) -> None:
    active = await sessions.call(link, "GET", "/api/incidents/active")
    by_id = {str(i["id"]): i for i in active}
    for incident in active:
        await _handle(context, link, incident, store, config)
    # Sự cố đã khôi phục hoặc đã đóng không còn trong /active: hỏi riêng từng sự cố đang theo dõi.
    for notice in store.notices_for(link.chat_id):
        if notice.incident_id in by_id:
            continue
        try:
            incident = await sessions.call(link, "GET", f"/api/incidents/{notice.incident_id}")
        except ApiError as error:
            if error.status in (403, 404):
                store.delete_notice(link.chat_id, notice.incident_id)
                continue
            raise
        await _handle(context, link, incident, store, config)


async def poll(context: ContextTypes.DEFAULT_TYPE) -> None:
    config, store, _, sessions = _deps(context)
    state = context.application.bot_data.setdefault("outage", {"since": None, "notified": False})
    failed = False
    for link in store.active_links():
        try:
            await _poll_link(context, link, store, sessions, config)
        except NeedsLogin:
            await _send(context, link.chat_id,
                        "Mật khẩu đã đổi hoặc tài khoản bị khoá nên bot ngừng báo. Gõ /login để đăng nhập lại.")
        except httpx.HTTPError:
            failed = True
        except ApiError as error:
            if error.status >= 500:
                failed = True
            else:
                log.warning("Lỗi API cho chat %s: %s %s", link.chat_id, error.status, error.code)
    if failed:
        state["since"] = state["since"] or time.time()
        if not state["notified"] and time.time() - state["since"] >= OUTAGE_NOTIFY_S:
            state["notified"] = True
            for link in store.active_links():
                await _send(context, link.chat_id,
                            "⚠️ Bot đang không kết nối được hệ thống giám sát. Cảnh báo có thể bị chậm.")
    else:
        if state["notified"]:
            for link in store.active_links():
                await _send(context, link.chat_id, "Bot đã kết nối lại hệ thống giám sát.")
        state.update(since=None, notified=False)


# ---------- Menu, lịch sử, thử còi ----------

async def show_menu(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    link = await _linked(update, context)
    if link:
        await update.message.reply_text("Chọn một mục bên dưới.", reply_markup=menu_for(link.role))


async def show_history(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    link = await _linked(update, context)
    if not link:
        return
    _, _, _, sessions = _deps(context)
    try:
        page = await sessions.call(link, "GET", "/api/incidents?page=1&pageSize=10")
    except NeedsLogin:
        await update.message.reply_text("Mật khẩu đã đổi hoặc tài khoản bị khoá. Gõ /login để đăng nhập lại.")
        return
    except (ApiError, httpx.HTTPError):
        await update.message.reply_text("Không lấy được lịch sử sự cố. Thử lại sau.")
        return
    await update.message.reply_text(texts.history_message(page.get("items", []), _now()),
                                    reply_markup=menu_for(link.role))


async def buzzer_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    link = await _linked(update, context)
    if not link:
        return
    if link.role != "landlord":
        await update.message.reply_text("Chỉ chủ trọ được thử còi và đèn.")
        return
    _, _, _, sessions = _deps(context)
    try:
        devices = (await sessions.call(link, "GET", "/api/devices")).get("items", [])
        rooms = await sessions.call(link, "GET", "/api/rooms")
    except NeedsLogin:
        await update.message.reply_text("Mật khẩu đã đổi hoặc tài khoản bị khoá. Gõ /login để đăng nhập lại.")
        return
    except (ApiError, httpx.HTTPError):
        await update.message.reply_text("Không lấy được danh sách node. Thử lại sau.")
        return
    names = {r["id"]: r["name"] for r in rooms}
    usable = [d for d in devices if d.get("lifecycle_status") == "active" and d.get("room_id")]
    if not usable:
        await update.message.reply_text("Chưa có node nào đang sử dụng trong nhà trọ của bạn.")
        return
    buttons = [[InlineKeyboardButton(
        f"{texts.room_name(names.get(d['room_id'], d['room_id']))} · {d['device_id']}",
        callback_data=f"buzz:{d['device_id']}")] for d in usable]
    await update.message.reply_text("Thử còi và đèn ở node nào?", reply_markup=InlineKeyboardMarkup(buttons))


async def on_buzz(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    match = re.fullmatch(r"(buzz|buzzgo|buzzno):([A-Za-z0-9_-]{0,32})", query.data or "")
    if not match:
        await query.answer()
        return
    kind, device_id = match.groups()
    if kind == "buzzno":
        await query.answer()
        await query.edit_message_text("Đã huỷ thử còi.")
        return
    if kind == "buzz":
        await query.answer()
        await query.edit_message_text(
            f"Còi và đèn đỏ của node {device_id} sẽ bật khoảng 3 giây. Tiếp tục?",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton("Thử ngay", callback_data=f"buzzgo:{device_id}"),
                InlineKeyboardButton("Huỷ", callback_data="buzzno:"),
            ]]))
        return
    _, store, _, sessions = _deps(context)
    link = store.get_link(query.message.chat.id)
    if link is None or link.status != "active" or link.role != "landlord":
        await query.answer("Chỉ chủ trọ đã đăng nhập mới thử còi được.", show_alert=True)
        return
    try:
        devices = (await sessions.call(link, "GET", "/api/devices")).get("items", [])
        item = next((d for d in devices if d["device_id"] == device_id), None)
        data = (item or {}).get("data")
        if not data:
            await query.answer("Node chưa gửi dữ liệu nên chưa thử được.", show_alert=True)
            return
        result = await sessions.call(
            link, "POST", f"/api/devices/{device_id}/buzzer-test",
            json={"expected_boot_id": data["boot_id"],
                  "expected_seq": (data.get("buzzer_test") or {}).get("command_seq", 0),
                  "action": "start"},
            headers={"X-IoT-Request": "1"})
    except NeedsLogin:
        await query.answer("Mật khẩu đã đổi hoặc tài khoản bị khoá. Gõ /login.", show_alert=True)
        return
    except ApiError as error:
        await query.answer()
        await query.edit_message_text(f"Không thử được: {error.message}")
        return
    except httpx.HTTPError:
        await query.answer("Không kết nối được hệ thống. Thử lại.", show_alert=True)
        return
    await query.answer("Đã gửi lệnh.")
    await query.edit_message_text(f"Node {device_id}: {result.get('message', 'Đã gửi lệnh thử còi.')}")


# ---------- Theo dõi mất kết nối và lỗi cảm biến (chỉ chủ trọ) ----------

async def _monitor_link(context, link: Link, store: Store, sessions: Sessions, config: Config) -> None:
    statuses = await sessions.call(link, "GET", "/api/rooms/status")
    devices = (await sessions.call(link, "GET", "/api/devices")).get("items", [])
    by_node = {d["device_id"]: d for d in devices}
    active: set[str] = set()
    labels: dict[str, str] = {}
    for st in statuses:
        node = st.get("node") or {}
        active |= conditions(st, by_node.get(node.get("id")))
        labels[st["room"]["id"]] = texts.room_name(st["room"]["name"])
    saved = {k: Alert(since, notified) for k, (since, notified) in store.get_alerts(link.chat_id).items()}
    events, state = step(saved, active, time.time(),
                         {"offline": config.offline_alert_seconds, "fault": config.fault_alert_seconds})
    for event in events:
        room_id = event.key.split(":")[0]
        await _send(context, link.chat_id,
                    texts.device_alert(event.kind, event.key, labels.get(room_id, f"Phòng {room_id}")))
    store.replace_alerts(link.chat_id, {k: (a.since, a.notified) for k, a in state.items()})


async def monitor(context: ContextTypes.DEFAULT_TYPE) -> None:
    config, store, _, sessions = _deps(context)
    for link in store.active_links():
        if link.role != "landlord":
            continue
        try:
            await _monitor_link(context, link, store, sessions, config)
        except NeedsLogin:
            pass  # vòng báo sự cố đã nhắn người dùng đăng nhập lại
        except (ApiError, httpx.HTTPError) as error:
            log.warning("Không theo dõi được node cho chat %s: %s", link.chat_id, error)


# ---------- Khởi tạo ----------

def build(config: Config) -> Application:
    async def post_init(app: Application) -> None:
        store = Store(config.db_path)
        backend = Backend(config.be_base_url)
        app.bot_data.update(config=config, store=store, backend=backend,
                            sessions=Sessions(backend, store, config.secret_key))
        app.job_queue.run_repeating(poll, interval=config.poll_seconds, first=2)
        app.job_queue.run_repeating(monitor, interval=config.monitor_seconds, first=5)
        await app.bot.set_my_commands(COMMANDS)

    app = Application.builder().token(config.telegram_token).post_init(post_init).build()
    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler("login", login_start)],
        states={
            ASK_USERNAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, login_username)],
            ASK_PASSWORD: [MessageHandler(filters.TEXT & ~filters.COMMAND, login_password)],
        },
        fallbacks=[CommandHandler("cancel", login_cancel)],
    ))
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("logout", logout))
    app.add_handler(MessageHandler(filters.Regex(f"^{BTN_ROOMS}$"), show_rooms))
    app.add_handler(MessageHandler(filters.Regex(f"^{BTN_INCIDENTS}$"), show_incidents))
    app.add_handler(MessageHandler(filters.Regex(f"^{BTN_LOGOUT}$"), logout))
    app.add_handler(MessageHandler(filters.Regex(f"^{BTN_HISTORY}$"), show_history))
    app.add_handler(MessageHandler(filters.Regex(f"^{BTN_BUZZER}$"), buzzer_start))
    app.add_handler(CommandHandler("help", show_help))
    app.add_handler(CommandHandler("menu", show_menu))
    app.add_handler(CommandHandler("phong", show_rooms))
    app.add_handler(CommandHandler("suco", show_incidents))
    app.add_handler(CommandHandler("lichsu", show_history))
    app.add_handler(CommandHandler("thucoi", buzzer_start))
    app.add_handler(CallbackQueryHandler(on_buzz, pattern=r"^buzz"))
    app.add_handler(CallbackQueryHandler(on_button))
    return app
