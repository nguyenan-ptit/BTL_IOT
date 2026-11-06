# Backend — FastAPI + MQTT + MySQL

Backend của hệ thống giám sát cảm biến phòng trọ (firmware schema 6). Nó:

1. subscribe topic MQTT `iot/devices/+/telemetry`, kiểm tra bản tin rồi lưu vào **MySQL**;
2. cung cấp API đọc trạng thái mới nhất và lịch sử của từng thiết bị;
3. gửi lệnh cập nhật ngưỡng và thử còi xuống thiết bị;
4. cung cấp API đăng ký thiết bị và quản lý vòng đời, có xác thực JWT và phân quyền theo phòng;
5. phục vụ trang dashboard thử nghiệm `index.html` tại `/`.

> Đây vẫn là **bản thử nghiệm** (prototype): payload phải có `test: true`, API trả `prototype: true`. Chưa triển khai public.

```text
ESP8266 ──MQTT──> Broker (EMQX Cloud / Mosquitto) ──> backend ──> MySQL (iot_db)
                                  ^                       │
                                  └── lệnh ngưỡng/còi ────┤
                                                          └──> REST API + dashboard
```

## Cấu trúc thư mục

| File                                   | Chức năng                                                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app.py`                               | Ứng dụng FastAPI, MQTT receiver, các API telemetry/điều khiển.                                                                                   |
| `storage.py`                           | Truy cập MySQL: ghi telemetry (chống trùng, cập nhật `last_seen_at`), đọc mới nhất, đọc lịch sử có lọc thời gian, ghi lịch sử lệnh, tính online. |
| `command_log.py`                       | Mixin dùng chung cho hai controller: ghi lệnh và trạng thái lệnh vào `device_commands`.                                                          |
| `validation.py`                        | Kiểm tra bản tin telemetry schema 2–6 và dựng thông tin cảm biến.                                                                                |
| `devices_api.py`                       | API đăng ký thiết bị và chuyển trạng thái vòng đời.                                                                                              |
| `auth.py`                              | Đọc JWT, kiểm tra role, kiểm tra quyền theo phòng.                                                                                               |
| `remote_control.py`                    | Gửi lệnh đổi ngưỡng, theo dõi ACK từ telemetry.                                                                                                  |
| `buzzer_control.py`                    | Gửi lệnh thử còi/LED, theo dõi ACK.                                                                                                              |
| `settings.py`                          | Đọc và kiểm tra cấu hình, ưu tiên biến môi trường.                                                                                               |
| `discovery.py`, `prepare_discovery.py` | Tìm broker qua UDP trong LAN (mặc định tắt).                                                                                                     |
| `simulated_esp.py`                     | Giả lập một node gửi telemetry để thử.                                                                                                           |
| `test_devices.py`                      | Kịch bản kiểm thử API đăng ký/vòng đời thiết bị (cần server và MySQL đang chạy).                                                                 |
| `test_command_log.py`                  | Kiểm thử `last_seen_at`, lọc lịch sử và ghi `device_commands`, không cần MySQL.                                                                  |
| `settings.example.json`                | Mẫu cấu hình (không chứa bí mật).                                                                                                                |
| `index.html`                           | Dashboard thử nghiệm.                                                                                                                            |

## Yêu cầu

- Python 3.10 trở lên
- MySQL 8.0 đã tạo schema, xem [../database/README.md](../database/README.md)
- Một MQTT broker truy cập được (EMQX Cloud hoặc broker cục bộ)

## Cài đặt và chạy

**1. Tạo database** (một lần), xem hướng dẫn ở `database/README.md`:

```bash
mysql -u root -p < ../database/init.sql
mysql -u root -p < ../database/seed_demo.sql
```

**2. Tạo cấu hình cục bộ và cài thư viện** (Windows PowerShell):

```powershell
cd backend
Copy-Item .\settings.example.json .\settings.local.json
py -m pip install -r requirements.txt
```

Linux/macOS:

```bash
cd backend
cp settings.example.json settings.local.json
python3 -m pip install -r requirements.txt
```

**3. Sửa `settings.local.json`** (xem bảng bên dưới), sau đó chạy:

```powershell
py -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Khi khởi động, backend nạp cấu hình, kiểm tra schema MySQL, kết nối MQTT rồi mới nhận request. Mở `http://127.0.0.1:8000/` xem dashboard, `http://127.0.0.1:8000/docs` xem tài liệu API tự sinh. Sai cấu hình hoặc thiếu schema thì tiến trình dừng ngay với thông báo lỗi.

## Cấu hình

Backend đọc `settings.local.json`; nếu không có sẽ rơi về `settings.example.json`. Có thể trỏ tới file khác bằng biến `IOT_FULL_SETTINGS`.

| Khóa                                                 | Ý nghĩa                                                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `mqtt_host`, `mqtt_port`                             | Địa chỉ broker. Mẫu đặt `127.0.0.1:1883`; EMQX Serverless dùng hostname của deployment và cổng `8883`.                   |
| `mqtt_topic`                                         | **Bắt buộc** là `iot/devices/+/telemetry`, giá trị khác bị từ chối.                                                      |
| `mqtt_username`, `mqtt_password`                     | Tài khoản tạo trong _Access Control_ của broker, không phải tài khoản đăng nhập console.                                 |
| `mqtt_tls`, `mqtt_ca_certs`                          | Bật TLS thì phải có file CA (tên file cạnh file settings hoặc đường dẫn tuyệt đối). Luôn kiểm tra chứng chỉ và hostname. |
| `mqtt_client_id`                                     | Tùy chọn, mặc định `iot-full-backend`.                                                                                   |
| `discovery_enabled`, `discovery_key_path`            | Tìm broker trong LAN. Đặt `false` khi dùng cloud.                                                                        |
| `mysql.host`, `port`, `user`, `password`, `database` | Kết nối MySQL. Bắt buộc có mật khẩu.                                                                                     |

**Biến môi trường** ghi đè file cấu hình, nên dùng cho thông tin bí mật:

| Biến                                                                                             | Ghi đè                                  |
| ------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `IOT_MQTT_HOST`, `IOT_MQTT_USERNAME`, `IOT_MQTT_PASSWORD`                                        | thông tin MQTT                          |
| `IOT_MYSQL_HOST`, `IOT_MYSQL_PORT`, `IOT_MYSQL_USER`, `IOT_MYSQL_PASSWORD`, `IOT_MYSQL_DATABASE` | thông tin MySQL                         |
| `IOT_FULL_SETTINGS`                                                                              | đường dẫn file settings                 |
| `JWT_SECRET`                                                                                     | khóa ký JWT, **phải đặt khi chạy thật** |

`settings.local.json`, file CA, mật khẩu, database và log đã nằm trong `.gitignore`; đừng commit chúng.

## Luồng nhận telemetry

1. Nhận bản tin ở topic `iot/devices/<device_id>/telemetry`. Bản tin retained bị từ chối.
2. `validation.py` kiểm tra: kích thước ≤ 4096 byte, là JSON object, `schema_version` từ 2 đến 6, `test: true`, `device_id`/`room` đúng định dạng `[A-Za-z0-9_-]{1,32}`, `boot_id` gồm 16 ký tự hex, `seq` từ 0 đến 2³² − 1, các khối cảm biến đúng kiểu.
3. `device_id` trong payload phải **khớp** với `device_id` trong topic.
4. `storage.save()` kiểm tra thiết bị trong bảng `devices`, ghi vào `history`, và nếu đây là mẫu mới thì cập nhật `devices.last_seen_at` trong cùng giao dịch.

Kết quả mỗi bản tin được đếm trong `/api/health`:

| Trường       | Khi nào tăng                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------- |
| `accepted`   | Ghi mới thành công.                                                                            |
| `duplicates` | Trùng `(device_id, boot_id, seq)`, bỏ qua.                                                     |
| `rejected`   | Sai topic/payload, thiết bị chưa đăng ký, hoặc thiết bị bị khóa/ngừng dùng/thu hồi credential. |
| `last_error` | Lý do lỗi gần nhất; lỗi MySQL không làm tăng `rejected` nhưng được ghi ở đây.                  |

Online/offline được tính khi đọc: thiết bị online nếu bản tin gần nhất được nhận trong vòng 20 giây. Thời gian dùng giờ nhận của backend (UTC), không dùng giờ của ESP.

## API

### Telemetry và điều khiển

Các endpoint này hiện **chưa yêu cầu JWT** (xem mục lưu ý bảo mật).

| Method | Đường dẫn                                                | Mô tả                                                                                                     |
| ------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GET    | `/`                                                      | Dashboard thử nghiệm.                                                                                     |
| GET    | `/api/health`                                            | Trạng thái MQTT receiver, discovery và bộ đếm.                                                            |
| GET    | `/api/devices`                                           | Trạng thái mới nhất của từng thiết bị đã có dữ liệu (online, `display_state`, cảm biến, trạng thái lệnh). |
| GET    | `/api/history?device_id=node02&limit=20&from=...&to=...` | Lịch sử mới nhất trước; `limit` từ 1 đến 100, mặc định 20. `from`/`to` là tùy chọn, xem bên dưới.         |
| POST   | `/api/devices/{device_id}/thresholds`                    | Gửi ngưỡng mới, trả `202`.                                                                                |
| POST   | `/api/devices/{device_id}/buzzer-test`                   | Bắt đầu hoặc dừng thử còi/LED, trả `202`.                                                                 |

**Lọc lịch sử theo thời gian.** `from` và `to` là mốc ISO 8601 **bắt buộc có múi giờ**, lọc theo thời điểm backend nhận mẫu, gồm cả hai đầu mút, độ chính xác tới giây. Thiếu múi giờ hoặc `from` sau `to` thì trả `422`. Kết quả vẫn là mới nhất trước và bị cắt ở `limit` (tối đa 100), nên khoảng thời gian dài chỉ trả 100 mẫu gần `to` nhất.

```text
/api/history?device_id=node02&from=2026-11-06T00:00:00Z&to=2026-11-06T06:00:00Z
/api/history?device_id=node02&from=2026-11-06T07:00:00%2B07:00
```

Dấu `+` của múi giờ trong URL phải viết là `%2B`; nếu không, nó bị đọc thành dấu cách và request bị từ chối với lỗi định dạng.

Hai lệnh POST bắt buộc có header `X-IoT-Request: 1`, `Content-Type: application/json`, và nếu có `Origin` thì phải cùng nguồn với server. Thiết bị phải đã có telemetry thì mới nhận lệnh (nếu không trả `404`).

**Lịch sử lệnh.** Mỗi lệnh đổi ngưỡng và thử còi được ghi vào bảng `device_commands`: một dòng khi gửi, rồi cập nhật khi ESP xác nhận, hết hạn hoặc bị thay thế (trạng thái: `pending`, `running`, `applied`, `completed`, `stopped`, `blocked`, `interrupted`, `superseded`, `timeout`). Lệnh không cần gửi xuống ESP (ngưỡng đã đúng, hoặc `stop` khi không có lượt thử nào) cũng được ghi, đánh dấu `"sent": false` trong `request_payload`. Phần telemetry của ESP chứng minh kết quả được lưu ở `response_payload`. Những điểm cần biết:

- Ghi lịch sử là phụ: MySQL lỗi thì lệnh vẫn được gửi và phản hồi API không đổi; backend ghi cảnh báo và tự ghi bù sau 5 giây ở lần dashboard gọi `/api/devices` kế tiếp.
- Trạng thái lệnh chỉ cập nhật khi có người gọi `/api/devices` (hoặc gửi lệnh mới). Lệnh không ai theo dõi sẽ nằm ở `pending` trong DB cho đến lúc đó.
- Khi backend khởi động lại, mọi dòng còn `pending`/`running` được đóng thành `timeout`, vì trạng thái trong RAM đã mất.
- `requested_by` hiện là `NULL` vì các endpoint này chưa có đăng nhập. Khi gắn JWT, truyền `requested_by=user["user_id"]` vào `submit()`.

Ví dụ đổi ngưỡng. `expected_boot_id` và `expected_revision` lấy từ telemetry mới nhất của thiết bị:

```json
{
  "expected_boot_id": "1234567890abcdef",
  "expected_revision": 0,
  "thresholds": {
    "mq2_on": 600,
    "mq2_off": 400,
    "temperature_on_c": 35.0,
    "temperature_off_c": 30.0
  }
}
```

Ràng buộc: `mq2_on` 1–1023, `mq2_off` 0–1022 và phải nhỏ hơn `mq2_on`; nhiệt độ từ −55 đến 125, tối đa một chữ số thập phân, ngưỡng tắt nhỏ hơn ngưỡng bật. Lệnh hết hạn sau 20 giây. Chỉ telemetry do thiết bị gửi lại mới xác nhận ngưỡng đã áp dụng. Định dạng chi tiết lệnh và ACK nằm trong [../docs/MQTT_CONTRACT.md](../docs/MQTT_CONTRACT.md).

### Đăng ký và vòng đời thiết bị (cần JWT)

| Method | Đường dẫn                            | Quyền        | Mô tả                                                                    |
| ------ | ------------------------------------ | ------------ | ------------------------------------------------------------------------ |
| POST   | `/api/devices/register`              | admin, owner | Đăng ký node mới, trả `201`. Trạng thái đầu là `registered` / `pending`. |
| GET    | `/api/devices/{device_id}`           | admin, owner | Xem thông tin thiết bị.                                                  |
| PATCH  | `/api/devices/{device_id}/lifecycle` | admin, owner | Đổi `lifecycle_status`, `credential_status` hoặc `maintenance_note`.     |

Phạm vi quyền: `admin` thao tác mọi phòng; `owner` chỉ thao tác phòng thuộc nhà trọ của mình; `tenant` bị từ chối. Mọi thay đổi được ghi vào `audit_logs`. Bảng chuyển trạng thái hợp lệ nằm trong [../database/README.md](../database/README.md).

Đăng ký:

```json
{
  "device_id": "node03",
  "device_name": "Node phòng 103",
  "room_id": "103",
  "mqtt_username": "node03",
  "board_model": "NodeMCU ESP-12E"
}
```

Ví dụ thân PATCH:

| Thao tác           | Body                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| Kích hoạt          | `{"lifecycle_status": "active", "credential_status": "active"}`        |
| Bảo trì            | `{"lifecycle_status": "maintenance", "maintenance_note": "Thay MQ-2"}` |
| Khóa / mở khóa     | `{"lifecycle_status": "blocked"}` / `{"lifecycle_status": "active"}`   |
| Thu hồi credential | `{"credential_status": "revoked"}`                                     |
| Ngừng sử dụng      | `{"lifecycle_status": "decommissioned"}`                               |

Mã lỗi thường gặp: `400` body rỗng, `401` thiếu/sai token, `403` không đủ quyền hoặc không quản lý phòng đó, `404` không thấy phòng/thiết bị, `409` trùng ID hoặc chuyển trạng thái không hợp lệ, `422` dữ liệu sai định dạng, `503` lỗi database.

### Xác thực JWT

Gửi header `Authorization: Bearer <token>`. Token ký HS256 bằng `JWT_SECRET`, payload phải có `user_id` và `role` (`admin` / `owner` / `tenant`).

**Backend hiện chưa có endpoint đăng nhập hay cấp token.** Khi phát triển, tự ký token bằng cùng khóa, ví dụ:

```python
import jwt
jwt.encode({"user_id": 1001, "role": "admin"}, "<JWT_SECRET>", algorithm="HS256")
```

## Thử với thiết bị giả lập

`simulated_esp.py` gửi telemetry schema 6 mỗi 3 giây tới broker `127.0.0.1:1883` (không xác thực). Mặc định nó dùng `device_id = esp32_sim_01`, thiết bị này **chưa có trong database** nên mọi bản tin sẽ bị từ chối. Cách xử lý:

- dùng thiết bị đã seed: đổi `DEVICE_ID` trong file thành `node01` hoặc `node02`; hoặc
- đăng ký thiết bị giả lập qua `POST /api/devices/register`, sau đó kích hoạt bằng `PATCH .../lifecycle`.

Sau đó kiểm tra `/api/health` (`accepted` tăng), `/api/devices` và `/api/history?device_id=node02`.

## Kiểm thử không cần MySQL

```bash
python test_command_log.py
```

Chạy được trên máy chưa cài MySQL, broker hay thư viện của backend. Bộ kiểm tra này xem câu SQL và tham số sinh ra (`last_seen_at`, lọc `from`/`to`, ghi và cập nhật `device_commands`) và kiểm tra luồng trạng thái của lệnh với DB giả, gồm cả trường hợp MySQL lỗi rồi hồi phục. Nó **không thay thế** việc chạy thật với MySQL.

## Kiểm thử API đăng ký/vòng đời

`test_devices.py` gọi thẳng vào server đang chạy và in PASS/FAIL cho từng ca (đăng ký, chuyển trạng thái, phân quyền).

1. Nạp `database/init.sql`, `seed_demo.sql` và `test_data.sql`.
2. Chạy backend với `JWT_SECRET` đặt trùng giá trị mà test dùng.
3. Mở `test_devices.py` và **sửa khối CẤU HÌNH cho khớp dữ liệu mẫu**. Giá trị mặc định trong file (`ADMIN_ID=2`, `OWNER_ID=3`, `TENANT_ID=4`) không khớp với `test_data.sql`, cần đổi thành:

   ```python
   ADMIN_ID = 1001
   OWNER_ID = 1002
   TENANT_ID = 1003
   OWN_ROOM = "T-OWN"
   OTHER_ROOM = "101"
   ```

4. Chạy `python test_devices.py`.

Mỗi lần chạy tạo thêm các thiết bị `TA…`, `TB…`, `TC…` trong bảng `devices` và các dòng trong `audit_logs`; hãy chạy trên database thử.

## Bảo mật

- `JWT_SECRET` trong `auth.py` có **giá trị mặc định công khai** (`doi-khoa-bi-mat-nay`). Bắt buộc đặt biến môi trường `JWT_SECRET` ngẫu nhiên và dài trước khi dùng ngoài máy dev, nếu không ai cũng có thể tự ký token admin.
- `/api/devices`, `/api/history` và hai lệnh POST điều khiển chưa dùng JWT; chỉ có kiểm tra header/origin cho lệnh POST. Cần thêm xác thực và phân quyền theo phòng trước khi mở ra ngoài.
- Dùng tài khoản MySQL riêng với quyền tối thiểu, không dùng `root`.
- Không log hay trả về payload thô, mật khẩu hoặc cấu hình qua API; giữ nguyên nguyên tắc này khi sửa code.
- Mặc định bind `127.0.0.1`. Khi triển khai cần reverse proxy HTTPS.

## Việc còn lại

- Endpoint đăng nhập, cấp và làm mới token; API quản lý người dùng.
- Gắn JWT và kiểm tra quyền theo phòng cho các API telemetry/điều khiển.
- Các API mà frontend `../frontend/` đang gọi nhưng backend chưa có: `/api/auth/*`, `/api/users`, `/api/nodes`, `/api/rooms`, `/api/boarding-houses`, `/api/incidents`, `/api/audit-logs`. Frontend đang chạy với dữ liệu giả (`VITE_USE_MOCK=true`).
- Tự động tạo sự cố vào bảng `incidents` (thành viên 3).
- Cập nhật `devices.firmware_version`/`hardware_version` từ telemetry (cần firmware gửi các trường này).
- Phân trang lịch sử khi cần xem quá 100 mẫu trong một khoảng thời gian.
- `storage.py` hỗ trợ khóa `ssl_ca` cho kết nối MySQL nhưng `settings.py` chưa cho phép khai báo khóa này; cần bổ sung nếu dùng MySQL cloud có TLS.
- Xác nhận âm thanh còi và LED thực tế trên từng bo; mô phỏng và ACK phần mềm không thay thế bước này.
