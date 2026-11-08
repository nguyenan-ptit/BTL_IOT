# Bot Telegram báo cháy/gas nhà trọ

Chủ trọ và người thuê đăng nhập bằng tài khoản của website, rồi nhận cảnh báo, tiếp nhận và đóng sự cố ngay trong Telegram. Mọi thao tác dùng chung API với website nên hiện ngay trên web. Thiết kế: `specs/002-bot-telegram/`.

## Cài đặt

Cần Python 3.11 trở lên.

```powershell
cd telegram-bot
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
copy .env.example .env
```

Điền `.env`:

- `TELEGRAM_BOT_TOKEN` (hoặc `BOT_TOKEN`): token do @BotFather cấp khi gõ `/newbot`.
- `BE_BASE_URL`: địa chỉ backend, ví dụ `https://xxxx.trycloudflare.com`. Tunnel chạy lại thì địa chỉ đổi, phải sửa dòng này rồi chạy lại bot.
- `BOT_SECRET_KEY`: khoá mã hoá mật khẩu người dùng, tạo bằng
  `.venv\Scripts\python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"`.
  Đổi khoá thì mọi người phải `/login` lại.

## Chạy

```powershell
.venv\Scripts\python run.py
```

Bot phải chạy liên tục thì mới báo được. Dừng bằng Ctrl+C.

## Dùng trên Telegram

- `/login`: nhập tên đăng nhập, rồi mật khẩu của website. Tin chứa mật khẩu bị xoá ngay.
- Nút **Tình trạng phòng**: các phòng trong phạm vi tài khoản, kèm số đo và giờ nhận gần nhất.
- Nút **Sự cố đang mở**: các sự cố chưa kết thúc.
- Có sự cố mới: bot gửi tin kèm nút **Tiếp nhận** và nhắc lại mỗi 10 giây tới khi có người tiếp nhận (trên web hoặc Telegram).
- Hết cảnh báo: bot gửi tin kèm nút **Đóng sự cố**.
- `/logout` hoặc nút **Đăng xuất**: ngừng nhận cảnh báo.

Tài khoản quản trị viên nhận được thông báo nhưng không có nút Tiếp nhận và Đóng, vì backend không cho quản trị viên làm hai việc này.

## Thử với hệ thống thật

1. Đăng nhập bằng tài khoản người thuê phòng 101, bấm Tình trạng phòng.
2. Gây cảnh báo an toàn: trên web, đăng nhập chủ trọ, vào Ngưỡng cảnh báo, đặt ngưỡng gas bật thấp hơn số gas hiện tại của node phòng 101.
3. Bot gửi cảnh báo trong vài giây; chờ thêm 10 giây phải có tin nhắc.
4. Bấm Tiếp nhận: web hiện dấu tiếp nhận, bot ngừng nhắc.
5. Đặt ngưỡng về giá trị cũ: bot gửi tin "đã về bình thường" kèm nút Đóng. Bấm Đóng: web hiện "Đã đóng bởi …".
6. Làm lại nhưng tiếp nhận trên web: bot sửa tin thành đã tiếp nhận và ngừng nhắc.

Nếu ở bước 5 bot báo "đã đóng" ngay mà không có nút Đóng, backend đang đóng thẳng sự cố khi số đo về bình thường thay vì chuyển sang trạng thái đã khôi phục.

## Test

```powershell
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m pytest -q
```

## Bảo mật

- `.env` và `bot.db` không được commit (đã có trong `.gitignore`).
- Mật khẩu người dùng lưu dạng mã hoá bằng `BOT_SECRET_KEY`. Ai có cả `bot.db` và `.env` thì giải mã được, nên chỉ để bot chạy trên máy tin cậy.
