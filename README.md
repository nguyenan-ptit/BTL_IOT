# Bàn giao P1 — phần cứng và firmware hai node

Ngày chuẩn bị: 26/10/2026. Phạm vi P1: lắp phần cứng, lập trình cảm biến và đèn/còi cho hai node. Gói này chứa phần bàn giao P1 để ghép vào repository nhóm; không phải toàn bộ ứng dụng đã hoàn thành.

## Nội dung cần đẩy lên repository nhóm

| Thư mục | Nội dung bàn giao |
|---|---|
| `firmware/node_full/` | Firmware V6 và cấu hình mẫu, không có mật khẩu thật |
| `hardware/` | Bảng chân, sơ đồ dây, danh sách linh kiện và nơi bổ sung ảnh prototype thật |
| `tests/` | Ba sketch thử riêng, hướng dẫn kiểm thử firmware và kịch bản kiểm tra cả hai node |
| `docs/` | Quy ước MQTT/schema6, JSON mô phỏng cho backend/frontend và tiến độ còn chờ |

Chép nội dung các thư mục vào đúng vị trí trong repository nhóm. Gộp quy tắc `.gitignore` vào file hiện có. Nếu repository đã có README chung, gộp phần P1 cần thiết hoặc đặt tài liệu này trong `docs/p1/`; không ghi đè README của nhóm. Không chỉ đẩy file ZIP: cần commit các mã nguồn và tài liệu đã giải nén.

`backend/`, `frontend/`, `database/`, `deployment/`, README tổng thể và `.env.example` chung cần phối hợp với thành viên phụ trách. Gói P1 không tạo những thư mục rỗng để coi là đã hoàn thành các phần đó. Firmware hiện đọc cấu hình C++ từ `config.h`, không tự đọc `.env`.

## Kiến trúc và điểm bàn giao

```text
DS18B20 / MQ-2 / Flame → ESP8266 → đèn/còi tại chỗ
                              └→ Wi-Fi → MQTT → backend → database / web / Telegram
```

Firmware đã có đọc cảm biến, quyết định trạng thái, điều khiển đèn/còi tại chỗ và gửi telemetry. Xem `docs/telemetry-contract.md` để bên backend nhận dữ liệu, bên frontend hiển thị và các thành viên khác thiết kế cảnh báo từ xa. Firmware này chưa có nhận lệnh MQTT, ACK lệnh hay cấu hình ngưỡng từ web; phần điều khiển từ xa cần thống nhất giao thức và phát triển tiếp.

## Chuẩn bị và biên dịch

1. Đọc `hardware/wiring.md` trước khi đấu dây. Ngắt mọi nguồn khi thay dây; nhánh D1 mới chỉ dành cho nguồn Flame 3V3.
2. Arduino IDE chọn **NodeMCU 1.0 (ESP-12E Module)**; cấu hình đã kiểm tra là ESP8266 core **3.1.2**, thư viện **MQTT 2.5.3 của Joel Gaehwiler/256dpi**, **OneWire** và **DallasTemperature 4.0.5**.
3. Sao chép `firmware/node_full/config.example.h` thành `config.h` cùng thư mục; điền Wi-Fi 2,4 GHz, địa chỉ broker và tài khoản cục bộ. IP `192.0.2.10` trong mẫu chỉ minh họa, phải thay bằng địa chỉ broker thật. Không commit `config.h`.
4. Đặt ID riêng cho hai node. Đề xuất khi nhóm thống nhất: `node01`/phòng `101`, `node02`/phòng `102`. Đây là quy hoạch đề xuất, chưa xác nhận đã áp dụng trên hai board. Bản thử V5 trước đây từng dùng `node02`/phòng `101`; cần báo cho backend nếu đổi ánh xạ.
5. Mở `node_full.ino` và Verify. Marker V6 là `NODE_FULL_V6_FLAME_POWER`. Xem `tests/README.md` để bật 31 kiểm tra tại thời điểm biên dịch.
6. Chỉ nạp/kiểm tra mạch sau khi dây, nguồn và đường USB đã sẵn sàng. Serial Monitor **115200 baud**; thông tin trạng thái khoảng 2 giây/lần. Không tự chọn COM cũ khi board đã đổi cổng.

Nếu compiler ESP8266 báo lỗi Unicode do đường dẫn tiếng Việt, đặt bản làm việc ở đường dẫn ASCII, ví dụ `C:\iot_p1\`. Thay đường dẫn không sửa được lỗi nguồn hoặc USB quá dòng.

## Tình trạng bàn giao trung thực

- **V6:** đã có code và đã biên dịch với kiểm tra chính sách/nguồn, nhưng chưa xác nhận được nạp lên ESP hay nối xong nhánh D1 tại thời điểm chuẩn bị gói.
- **Hai node:** là phạm vi cần hoàn thành và kiểm thử; chưa có bằng chứng cả hai node đã chạy đầy đủ.
- **V5:** từng nhận số đo thật từ một node qua USB/MQTT; kết quả lịch sử đó không phải kiểm chứng V6 hoặc node thứ hai.
- Ngưỡng MQ 60/55 là ADC thử, không phải ppm. Còi nghỉ HIGH cần đối chiếu module thật. Nguồn MQ tại VV và khả năng Flame hoạt động đúng ở 3V3 chưa được đo/xác nhận đầy đủ. Chi tiết và việc cần làm nằm trong `docs/progress.md`.

## Cách ghép việc trong nhóm

| Thành viên tiếp nhận | Cần đọc / cần thống nhất |
|---|---|
| Backend | `docs/telemetry-contract.md`, các mẫu JSON; broker/topic/tài khoản, ánh xạ ID/phòng, kiểm tra dữ liệu, lưu lịch sử và xử lý cảnh báo |
| Frontend | Trạng thái `normal/fault/alarm`, health từng cảm biến, đơn vị °C và ADC, thời gian nhận cuối; dữ liệu giả phải ghi rõ mô phỏng |
| Triển khai / bot | Cấu hình broker và truy cập; thông báo có chống gửi lặp; bot là phần nâng cao, không thay web quản lý |
| P1 | Hoàn thiện dây và kiểm tra V6 trên hai node; bổ sung ảnh thật, kết quả và log đã loại thông tin cá nhân |

Mỗi người commit bằng tài khoản GitHub của mình, mô tả đúng thay đổi thật. Không tạo lịch sử commit giả. Nhóm tạo tag/release cuối khi tích hợp và nghiệm thu; gói bàn giao này chưa phải khẳng định đạt v1.0.0.

## Thông tin không đưa lên GitHub

Không commit `config.h`, `.env` thật, token bot, file mật khẩu broker, database thật, log chứa dữ liệu cá nhân, `.venv`, cache hay `.bak`. `.gitignore` chỉ giúp bỏ qua file chưa được theo dõi; vẫn kiểm tra danh sách file trước khi commit. Không đưa mật khẩu/token vào nội dung commit hoặc ảnh chụp.
