# OTA firmware ESP8266

Firmware tải bản đã ký qua HTTPS và báo trạng thái qua MQTT. Backend lưu
phiên bản và job trong MySQL. Quản trị viên upload và chọn bản cập nhật
trong trang chi tiết node. Phạm vi hiện tại là cập nhật từng node.

## MQTT

| Topic | Publish | Subscribe |
| --- | --- | --- |
| `iot/devices/<device_id>/ota/start` | Backend | ESP của đúng thiết bị |
| `iot/devices/<device_id>/ota/status` | ESP của đúng thiết bị | Backend, dùng `iot/devices/+/ota/status` |

Cả hai dùng QoS 1, `retain=false`. Nếu broker dùng ACL chặn mặc định,
cấp quyền theo chiều trong bảng và giữ quyền cho `telemetry`, `config/set`
và `buzzer/test`. Backend cấp thêm hai quyền OTA khi tự quản lý tài khoản
node bằng EMQX Admin. Nếu broker từ chối đăng ký topic OTA, node sẽ tắt OTA đến
lần khởi động lại và kết nối lại để gửi telemetry. Backend tiếp tục nhận
schema 6 trên topic telemetry. Telemetry thêm hai trường cấp gốc:

- `firmware_version` là phiên bản của firmware đang chạy. Backend hiện đã
  đọc và lưu trường này.
- `ota_supported` là boolean. Chỉ cho phép yêu cầu OTA khi telemetry còn
  mới và giá trị là `true`. Coi trường thiếu ở bản cũ là `false`.

Payload mẫu gửi tới `iot/devices/node01/ota/start`:

```json
{
  "job_id": "ota-123",
  "boot_id": "0123456789abcdef",
  "expires_uptime_s": 285,
  "target_version": "v1.0.1",
  "url": "https://firmware.example.com/node01/v1.0.1.bin?token=example",
  "size_bytes": 480260,
  "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

- Giá trị trong ví dụ là minh họa. BE lấy `boot_id` và `uptime_s` từ
  telemetry mới nhất của chính thiết bị, rồi đặt hạn theo uptime (ví dụ
  `uptime_s + 60`). Node chỉ nhận lệnh cho phiên khởi động hiện tại và còn
  hạn tối đa 120 giây.
- `job_id` dài 1–48 ký tự ASCII chữ, số, gạch ngang hoặc gạch dưới.
  `target_version` dài 1–64, dùng thêm được dấu chấm, khớp chính xác với
  `NODE_FIRMWARE_VERSION` của file nạp. Mã yêu cầu phải duy nhất.
- `size_bytes` và `sha256` (64 ký tự hex thường) tính trên toàn bộ **file
  đã ký**. URL dài tối đa 768 ký tự, cả JSON dài tối đa 1.100 byte. Chỉ
  dùng HTTPS qua cổng 443 đúng hostname đã cấu hình trên bo. Endpoint tải
  trả HTTP 200, `Content-Length` chính xác, dữ liệu nhị phân gốc, không
  nén HTTP, không chunked và không chuyển hướng.
- Chỉ giữ một job đang chạy cho mỗi node. Firmware bỏ qua lệnh sai định
  dạng, sai boot, hết hạn và lệnh gửi đến khi một job khác đang chạy.
  Firmware giới hạn mỗi lượt tải/cài trong 180 giây. Backend nên cho job
  khoảng 5 phút để có thêm thời gian khởi động lại và nhận xác nhận.

Payload mẫu gửi về `iot/devices/node01/ota/status`:

```json
{
  "device_id": "node01",
  "job_id": "ota-123",
  "boot_id": "fedcba9876543210",
  "target_version": "v1.0.1",
  "firmware_version": "v1.0.1",
  "status": "booted",
  "progress": 100,
  "error": null
}
```

| Trạng thái thiết bị | Ý nghĩa |
| --- | --- |
| `downloading` | Đã nhận job, đang tải. Với MQTT LAN, tiến độ có thể lên 90 theo bước 10%. Với MQTT TLS chỉ đảm bảo mốc bắt đầu tải. |
| `installing` | Đã tải đủ và SHA-256 khớp. Đang xác minh chữ ký và chuẩn bị ghi nhận bản cài. |
| `booted` | Node đã khởi động lại và báo phiên bản đang chạy. |
| `failed` | Job dừng. `error` có mã máy đọc được, ví dụ `alarm_active`, `device_busy`, `clock_not_ready`, `checksum_mismatch`, `invalid_signature` hoặc `version_mismatch`. |

BE kiểm tra `device_id` khớp topic và quyền trên broker, đối chiếu với job.
Chỉ chuyển sang thành công nếu nhận `booted` với đúng `job_id`, đúng cả
hai trường phiên bản và `boot_id` mới. MQTT QoS 1 có thể giao trùng. BE xử
lý trạng thái theo kiểu idempotent và không cho bản tin tiến độ làm lùi job
đã kết thúc. Firmware lưu thông tin xác nhận lần cài cuối trong LittleFS,
gửi lại khi reconnect hoặc khi nhận lại cùng mã job, phiên bản đích và boot
gốc. Nếu mất xác nhận, BE có thể gửi lại nội dung lệnh gốc để hỏi lại trạng
thái. Việc chỉ thấy phiên bản mới trong telemetry không đủ để xác nhận job.

## Ranh giới giữa firmware, BE và FE

| Bên | Phần triển khai |
| --- | --- |
| Firmware | `firmware/node_full/`, xử lý hai topic và tải HTTPS. |
| Backend | ACL, quản lý file/phiên bản, tạo job, publish lệnh, nhận và lưu trạng thái. |
| Frontend | Danh sách phiên bản, chọn node, upload, tạo và theo dõi job qua API của BE. |

API cho quản trị viên:

- `POST /api/firmware?device_id=node10&version=v1.0.1` nhận nội dung
  file đã ký dưới dạng `application/octet-stream`, tối đa 1 MiB. BE kiểm tra
  chữ ký RSA-2048 và lưu bản cho đúng node trong MySQL. Tải lên cần thêm header
  `X-IoT-Firmware-Manifest` chứa dòng duy nhất trong file `.manifest` tạo cùng
  file `.bin`. Backend kiểm tra chữ ký manifest, node đích, phiên bản và SHA-256
  của toàn bộ file đã ký trước khi ghi vào MySQL.
- `GET /api/firmware?device_id=node10` liệt kê các bản của node.
- `POST /api/devices/{device_id}/ota` nhận `firmware_id`, trả HTTP 202 và
  `job_id`. Backend kiểm tra quyền, telemetry gần nhất, hỗ trợ OTA,
  thông tin phần cứng và job đang chạy trước khi gửi MQTT.
- `GET /api/devices/{device_id}/ota` trả khả năng OTA của BE, tình trạng
  kết nối MQTT cho OTA và job mới nhất. FE dùng endpoint này để hiển thị
  trạng thái cả khi tải lại trang.
- `GET /api/ota/jobs/{job_id}` trả trạng thái, tiến độ và lỗi cho FE.
- `GET /api/ota/download/{job_id}?token=...` phục vụ file cho ESP trong
  thời hạn job. Token tạo riêng cho từng job, chỉ gửi qua MQTT tới node.
  Cả hai API POST dùng header `X-IoT-Request: 1`.

## Bật OTA ở backend

1. Nâng schema MySQL bằng `backend/migrate.py --check`, sau đó `--apply`
   theo hướng dẫn trong `database/README.md`. Bản nâng tạo hai bảng OTA.
2. Trong `.env`, đặt `IOT_OTA_PUBLIC_ORIGIN=https://firmware.example.com`
   và `IOT_OTA_PUBLIC_KEY` trỏ tới khóa công khai PEM RSA-2048 đã nạp vào node.
   BE dùng khóa này để kiểm tra file trước khi lưu, còn khóa riêng chỉ dùng
   ở máy build để ký. Khi bỏ trống cả hai giá trị, tính năng OTA ở BE tắt.
3. DNS HTTPS phải dẫn đến BE hoặc reverse proxy chuyển tiếp trực tiếp
   `/api/ota/download/`. Dùng cổng 443, giữ `Content-Length`, bỏ nén và
   chuyển hướng với đường dẫn này. Uvicorn loại query ở access log cho
   đường dẫn tải. Nếu có reverse proxy, cấu hình log bỏ query hoặc tắt log
   cho endpoint này.
4. Mở **Quản trị → Node → chi tiết node → Cập nhật firmware**. Điền phiên bản
   từ bản build. Tải file `.signed.bin` và `.manifest` từ cùng thư mục kết
   quả, chọn bản, xác nhận và theo dõi job.

## Chuẩn bị hai bản để thử

1. Tạo `config.h` cục bộ và đặt `OTA_ENABLED=1`, hostname tải, CA HTTPS và
   khóa **công khai** RSA-2048 để xác minh chữ ký. Giữ khóa riêng ký file ở
   ngoài repo và ngoài bản firmware. Node cần đồng bộ được NTP.
2. Build `v1.0.0` và nạp USB lần đầu. Đặt `NODE_FIRMWARE_VERSION` thành
   `v1.0.1`, giữ cùng ID, thông tin MQTT, khóa công khai, board và thiết lập
   flash. Chạy công cụ tạo bản FOTA bên dưới. Công cụ lấy ID và phiên bản
   từ cùng bản sao cấu hình được dùng để biên dịch rồi ký cả hai file.
   Vì bản build hiện chứa cấu hình MQTT của node, xử lý file như dữ liệu
   có thông tin đăng nhập. Chỉ dùng bản build cho đúng node được cấu hình.
3. Xác nhận BE thấy `v1.0.0` và `ota_supported: true`. Tạo job, kiểm tra
   tiến độ, rồi đối chiếu `booted` và telemetry của `v1.0.1`. Thử thêm
   file sai hash hoặc sai chữ ký và kiểm tra node còn chạy bản cũ.

Từ thư mục gốc trên PowerShell, dùng Python trong môi trường đã cài các
thư viện của backend và Arduino CLI đã cài core, board, thư viện dự án:

```powershell
.\.venv\Scripts\python.exe .\firmware\build_ota_release.py --private-key "C:\duong-dan\firmware-private.pem"
```

Nếu Arduino CLI chưa có trong `PATH`, truyền `--arduino-cli "C:\duong-dan\arduino-cli.exe"`.
Mặc định công cụ dùng board `esp8266:esp8266:nodemcuv2` và lưu cả hai file
trong `firmware/build/ota/<device_id>-<version>/`.

Cơ chế kiểm tra manifest áp dụng lúc tải lên. Các bản đã lưu trước khi
nâng cấp không có manifest đã được kiểm tra.

Firmware từ chối OTA khi đang báo động, thử còi hoặc thiết lập kết nối
Wi-Fi mới. Phần tải đọc từng khối để vòng lặp còn lấy mẫu cảm biến. Bắt
tay HTTPS, thao tác flash và khởi động lại có thể làm gián đoạn lấy mẫu,
nên cần kiểm tra độ trễ, dung lượng flash và heap khi chạy trên bo thật.
Khi MQTT dùng TLS, node báo bắt đầu tải rồi tạm đóng MQTT để dành RAM cho
HTTPS và ghi flash. Node kết nối lại MQTT nếu gặp lỗi hoặc sau khi
khởi động lại thành công. BE có thể nhận `booted` mà chưa nhận `installing`.
BE/FE nên hiển thị đang cập nhật trong khoảng tạm gián đoạn telemetry.
Cơ chế OTA Arduino Core không có
tự rollback sau khi bản mới đã được ghi đè rồi chạy lỗi. Giữ USB làm đường
khôi phục cho phạm vi demo này.
