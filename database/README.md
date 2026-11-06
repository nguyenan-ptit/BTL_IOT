# Database — MySQL

Schema MySQL cho hệ thống giám sát cảm biến phòng trọ (tài khoản, nhà trọ, phòng, thiết bị, telemetry, sự cố, lệnh điều khiển, nhật ký). Backend FastAPI (`../backend/`) ghi và đọc dữ liệu qua `PyMySQL` trong `backend/storage.py`.

- **Yêu cầu:** MySQL 8.0 (tối thiểu 5.7.8 vì có cột `JSON`), engine InnoDB, charset `utf8mb4`.
- **Tên database:** `iot_db`.
- **Không commit** file `.db`, mật khẩu MySQL hay chuỗi kết nối thật vào Git.

## Các file trong thư mục

| File            | Vai trò                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init.sql`      | **Schema chuẩn.** Tạo database `iot_db` và 10 bảng. `device_id` dài 64 ký tự.                                                                                                                                                                     |
| `init_db.sql`   | Bản cũ của schema. Khác `init.sql` ở chỗ `device_id` chỉ dài 50 ký tự và comment còn sót ký hiệu `[cite: 1]`. `backend/storage.py` vẫn nhắc tên file này trong thông báo lỗi. Nên dùng `init.sql` và xóa hoặc đồng bộ file còn lại để tránh nhầm. |
| `seed_demo.sql` | Dữ liệu demo: 1 chủ trọ, 1 nhà trọ, phòng `101`, `102`, thiết bị `node01`, `node02` (đã `active`).                                                                                                                                                |
| `test_data.sql` | Dữ liệu riêng cho `backend/test_devices.py`: 3 user test, 1 nhà test, phòng `T-OWN`.                                                                                                                                                              |

## Tạo database

Chạy từ thư mục gốc của repo, theo đúng thứ tự:

```bash
mysql -u root -p < database/init.sql
mysql -u root -p < database/seed_demo.sql    # tùy chọn: dữ liệu demo
mysql -u root -p < database/test_data.sql    # tùy chọn: chỉ khi chạy test_devices.py
```

Lưu ý:

- `init.sql` dùng `CREATE TABLE` không có `IF NOT EXISTS`, nên **chạy lần hai sẽ báo lỗi** "table already exists". Muốn tạo lại từ đầu thì `DROP DATABASE iot_db;` rồi chạy lại. Chưa có công cụ migration.
- `seed_demo.sql` và `test_data.sql` dùng `INSERT IGNORE` nên chạy lại nhiều lần được.
- Backend **không tự tạo bảng**. Lúc khởi động, `storage.initialize()` chỉ kiểm tra bảng `history` có khóa duy nhất `(device_id, boot_id, seq)` trên toàn bộ `device_id`; thiếu thì backend từ chối chạy.

### Tạo tài khoản MySQL riêng cho ứng dụng

Không dùng `root` cho backend. Backend chỉ cần `SELECT`, `INSERT`, `UPDATE` (chưa có thao tác `DELETE`):

```sql
CREATE USER 'iot_app'@'localhost' IDENTIFIED BY '<mật-khẩu-mạnh>';
GRANT SELECT, INSERT, UPDATE ON iot_db.* TO 'iot_app'@'localhost';
FLUSH PRIVILEGES;
```

Điền thông tin này vào `backend/settings.local.json` hoặc biến môi trường `IOT_MYSQL_*` (xem [backend/README.md](../backend/README.md)). `settings.example.json` chỉ chứa giá trị mẫu.

## Các bảng

| Bảng                | Mô tả                                                                             | Backend đang dùng?                              |
| ------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------- |
| `users`             | Tài khoản; `role` = `admin` / `owner` / `tenant`; `status` = `active` / `locked`. | Chỉ qua JWT và khóa ngoại, chưa có API đọc/ghi. |
| `houses`            | Khu nhà trọ, thuộc một `owner_id`.                                                | Có: kiểm tra quyền của chủ trọ.                 |
| `rooms`             | Phòng, khóa chính `room_id` (chuỗi, ví dụ `101`).                                 | Có.                                             |
| `room_users`        | Người thuê theo từng phòng và khoảng thời gian.                                   | Chưa.                                           |
| `devices`           | Vòng đời thiết bị: trạng thái, credential tham chiếu, firmware, ghi chú bảo trì.  | Có.                                             |
| `history`           | Telemetry đã kiểm tra hợp lệ.                                                     | Có.                                             |
| `incidents`         | Sự cố/cảnh báo theo vòng đời `open → handling → recovered → closed`.              | Chưa.                                           |
| `incident_receipts` | Người dùng nào đã xem sự cố nào.                                                  | Chưa.                                           |
| `device_commands`   | Lịch sử lệnh gửi xuống thiết bị (ngưỡng, thử còi).                                | Có: ghi khi gửi lệnh và khi có kết quả.         |
| `audit_logs`        | Nhật ký thao tác.                                                                 | Có: ghi khi đăng ký thiết bị và đổi vòng đời.   |

Quan hệ chính:

```text
users ─┬─< houses ─< rooms ─┬─< devices ─┬─< history
       │                    │            ├─< incidents ─< incident_receipts >─ users
       │                    │            └─< device_commands
       └─< room_users >─────┘
audit_logs ─> users, rooms
```

## Quy ước dữ liệu

### Bảng `history`

- Mỗi dòng là một bản tin telemetry đã qua kiểm tra. Cột `raw_payload` lưu nguyên JSON schema 6; các cột `temperature_c`, `mq2_adc`, `flame_do` là bản trích ra để truy vấn nhanh.
- **`timestamp` là thời điểm backend nhận bản tin, tính theo UTC**, không phải giờ của thiết bị. Lưu dạng `DATETIME` không múi giờ và đã cắt phần lẻ giây.
- **Chống trùng:** khóa duy nhất `uq_history_message (device_id, boot_id, seq)`. Backend ghi bằng `INSERT ... ON DUPLICATE KEY UPDATE id = id`, nên bản tin gửi lại sẽ bị bỏ qua và chỉ tăng bộ đếm `duplicates`. Khóa phải dùng **toàn bộ** `device_id`, không dùng tiền tố như `device_id(30)`.
- `room_id` được backend tự lấy từ bảng `devices` lúc ghi. Cột `room` là nhãn do ESP tự gửi lên, không dùng làm khóa.
- `seq` là `INT UNSIGNED` để chứa đủ dải 0 đến 2³² − 1 mà validator cho phép.
- Trạng thái **online/offline không lưu trong database**. Backend tính khi đọc: online nếu bản tin mới nhất nhận trong vòng 20 giây.
- Chưa có chính sách xóa hoặc nén dữ liệu cũ; bảng sẽ lớn dần theo thời gian.

### Bảng `device_commands`

Mỗi lệnh đổi ngưỡng (`command_type = 'thresholds'`) hoặc thử còi/LED (`'buzzer_test'`) có một dòng, khóa theo `request_id` (32 ký tự hex, UNIQUE).

- `status`: `pending` và `running` là chưa kết thúc; `applied`, `completed`, `stopped`, `blocked`, `interrupted`, `superseded`, `timeout` là trạng thái cuối. Một lệnh `timeout` vẫn có thể chuyển thành `applied` nếu telemetry xác nhận đến muộn.
- `request_payload` là đúng bản tin đã publish cho ESP kèm `"sent": true`; lệnh không cần gửi (ngưỡng đã đúng, `stop` khi không có lượt thử) ghi `"sent": false`.
- `response_payload` là phần telemetry của ESP (`remote_config` hoặc `buzzer_test`) chứng minh kết quả.
- `acknowledged_at` ghi lần đầu **ESP xác nhận**; `timeout` và `superseded` không đặt cột này. `finished_at` ghi mỗi lần sang trạng thái cuối.
- Mọi mốc thời gian là UTC. `requested_at` do backend đặt rõ ràng, không dùng `DEFAULT CURRENT_TIMESTAMP` của MySQL (múi giờ máy chủ).
- Khi backend khởi động, các dòng còn `pending`/`running` bị đóng thành `timeout`.

### Bảng `devices`

Chỉ thiết bị đã đăng ký mới được ghi telemetry. Bản tin bị từ chối (tăng `rejected`, ghi `last_error`) khi:

- `device_id` chưa có trong `devices` (khóa ngoại, lỗi MySQL 1452);
- `lifecycle_status` là `blocked` hoặc `decommissioned`;
- `credential_status` là `revoked`.

`last_seen_at` là thời điểm backend nhận mẫu **mới** gần nhất (UTC). Bản tin trùng không làm mới nó, và việc cập nhật không làm đổi `updated_at`.

Chuyển trạng thái hợp lệ (kiểm tra trong `backend/devices_api.py`):

| Từ               | Sang được                                  |
| ---------------- | ------------------------------------------ |
| `registered`     | `provisioned`, `blocked`, `decommissioned` |
| `provisioned`    | `active`, `blocked`, `decommissioned`      |
| `active`         | `maintenance`, `blocked`, `decommissioned` |
| `maintenance`    | `active`, `blocked`, `decommissioned`      |
| `blocked`        | `active` (mở khóa), `decommissioned`       |
| `decommissioned` | không đổi được nữa                         |

`credential_status`: `pending → active`, `pending/active → revoked`, `revoked` là trạng thái cuối. Chỉ vào `active` khi credential đang `active`. `decommissioned` tự động thu hồi credential. Bảng chỉ lưu `mqtt_username` để tham chiếu, **không lưu mật khẩu MQTT**.

## Dữ liệu mẫu

`seed_demo.sql` tạo:

| Loại     | Giá trị                                                   |
| -------- | --------------------------------------------------------- |
| User     | `user_id=1`, `demo_owner` (owner)                         |
| Nhà      | `house_id=1`                                              |
| Phòng    | `101`, `102`                                              |
| Thiết bị | `node01` → phòng 101, `node02` → phòng 102 (đều `active`) |

`test_data.sql` tạo:

| Loại  | Giá trị                                                        |
| ----- | -------------------------------------------------------------- |
| User  | `1001` `test_admin`, `1002` `test_owner`, `1003` `test_tenant` |
| Nhà   | `house_id=1001` (của `test_owner`)                             |
| Phòng | `T-OWN`                                                        |

Mọi user mẫu có `password_hash = 'DEMO-NOT-A-REAL-HASH'` và `status = 'locked'`, **không đăng nhập được**. Chúng chỉ để làm khóa ngoại và dùng với JWT tự ký khi test. Không dùng dữ liệu này cho môi trường thật.

## Kiểm tra nhanh sau khi cài

```sql
USE iot_db;
SHOW TABLES;                                          -- phải có 10 bảng
SHOW INDEX FROM history WHERE Key_name = 'uq_history_message';
SELECT device_id, room_id, lifecycle_status, credential_status FROM devices;

-- Khi backend đã nhận dữ liệu:
SELECT device_id, boot_id, seq, `timestamp`, system_state
FROM history ORDER BY id DESC LIMIT 10;
SELECT device_id, last_seen_at FROM devices;

-- Sau khi gửi thử một lệnh đổi ngưỡng hoặc thử còi:
SELECT command_type, status, requested_at, acknowledged_at, finished_at, error_message
FROM device_commands ORDER BY command_id DESC LIMIT 10;

-- Sau khi chạy test_devices.py:
SELECT actor_user_id, action, target_id, details
FROM audit_logs ORDER BY log_id DESC LIMIT 20;
```

## Hạn chế đã biết

- `devices_api.py` ghi `activated_at` và `decommissioned_at` bằng `NOW()` (múi giờ của MySQL server), trong khi `history.timestamp` và `seed_demo.sql` dùng UTC. Nên đặt MySQL server về UTC hoặc đổi sang `UTC_TIMESTAMP()`.
- Các bảng `incidents`, `incident_receipts`, `room_users` đã có schema nhưng chưa có code backend ghi vào.
- `device_commands.requested_by` đang là `NULL` cho đến khi các endpoint điều khiển có đăng nhập.
- Chưa có file migration; thay đổi schema hiện phải sửa tay `init.sql`.
