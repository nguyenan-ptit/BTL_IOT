"""Bot Telegram: đăng nhập bằng tài khoản web, xem phòng, nhận, tiếp nhận và đóng sự cố."""
import logging
import re
import time
from datetime import datetime, timezone

import httpx
from telegram import (InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton,
                      ReplyKeyboardMarkup, Update)
from telegram.error import TelegramError
from telegram.ext import (Application, CallbackQueryHandler, CommandHandler, ContextTypes,
                          ConversationHandler, MessageHandler, filters)

from . import texts
from .backend import ApiError, Backend
from .config import Config
from .crypto import encrypt
from .decide import Action, next_action
from .sessions import NeedsLogin, Sessions
from .store import Link, Notice, Store

log = logging.getLogger("bot")

BTN_ROOMS = "Tình trạng phòng"
BTN_INCIDENTS = "Sự cố đang mở"
BTN_LOGOUT = "Đăng xuất"
MENU = ReplyKeyboardMarkup(
    [[KeyboardButton(BTN_ROOMS), KeyboardButton(BTN_INCIDENTS)], [KeyboardButton(BTN_LOGOUT)]],
    resize_keyboard=True,
)
ASK_USERNAME, ASK_PASSWORD = range(2)
OUTAGE_NOTIFY_S = 120


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _deps(context: ContextTypes.DEFAULT_TYPE) -> tuple[Config, Store, Backend, Sessions]:
    d = context.application.bot_data
    return d["config"], d["store"], d["backend"], d["sessions"]


def _ack_button(incident_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton("Tiếp nhận", callback_data=f"ack:{incident_id}")]])


def _close_button(incident_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton("Đóng sự cố", callback_data=f"close:{incident_id}")]])


def _can_act(link: Link) -> bool:
    # Backend không cho quản trị viên tiếp nhận hay đóng sự cố.
    return link.role in ("landlord", "tenant")


# ---------- Lệnh và đăng nhập ----------

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    _, store, _, _ = _deps(context)
    link = store.get_link(update.effective_chat.id)
    if link and link.status == "active":
        await update.message.reply_text(f"Bạn đang đăng nhập là {link.display_name}.", reply_markup=MENU)
        return
    await update.message.reply_text(
        "Bot báo cháy/gas nhà trọ. Gõ /login và đăng nhập bằng tài khoản của website để nhận cảnh báo.")


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
    note = "" if user["role"] in ("landlord", "tenant") else (
        "\nTài khoản quản trị viên chỉ nhận thông báo, không tiếp nhận hay đóng sự cố được.")
    await context.bot.send_message(
        chat_id, f"Đã đăng nhập: {user.get('displayName') or username}. Bot sẽ báo khi có sự cố.{note}",
        reply_markup=MENU)
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
    await update.message.reply_text(texts.rooms_message(statuses, _now()), reply_markup=MENU)


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
        await update.message.reply_text("Không có sự cố nào đang mở.", reply_markup=MENU)
        return
    for incident in incidents:
        if incident["status"] == "open":
            markup = _ack_button(incident["id"]) if _can_act(link) else None
            await update.message.reply_text(texts.incident_alert(incident, _now()), reply_markup=markup)
        else:
            await update.message.reply_text(texts.incident_acknowledged(incident, _now()))


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
    action = next_action(incident, notice, time.time(), config.remind_seconds)
    now = _now()
    chat = link.chat_id
    if action == Action.SEND_NEW:
        if incident["status"] == "open":
            mid = await _send(context, chat, texts.incident_alert(incident, now),
                              _ack_button(incident["id"]) if _can_act(link) else None)
            phase = "open"
        else:
            mid = await _send(context, chat, texts.incident_acknowledged(incident, now))
            phase = "acknowledged"
        store.save_notice(Notice(chat, incident["id"], phase, mid, time.time()))
    elif action == Action.REMIND:
        await _edit(context, chat, notice.message_id)  # bỏ nút ở tin cũ, chỉ giữ nút ở tin mới nhất
        mid = await _send(context, chat, texts.incident_alert(incident, now, reminder=True),
                          _ack_button(incident["id"]) if _can_act(link) else None)
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
                          _close_button(incident["id"]) if _can_act(link) else None)
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


# ---------- Khởi tạo ----------

def build(config: Config) -> Application:
    async def post_init(app: Application) -> None:
        store = Store(config.db_path)
        backend = Backend(config.be_base_url)
        app.bot_data.update(config=config, store=store, backend=backend,
                            sessions=Sessions(backend, store, config.secret_key))
        app.job_queue.run_repeating(poll, interval=config.poll_seconds, first=2)

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
    app.add_handler(CallbackQueryHandler(on_button))
    return app
