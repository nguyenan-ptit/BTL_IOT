# Chạy backend trên Windows CMD

Chạy lệnh từ thư mục gốc repository. Hướng dẫn này dành cho CMD (`D:\...>`); cú pháp PowerShell khác ở bước đặt biến môi trường. Máy nhận cần Python 3.10 trở lên, MySQL có InnoDB/JSON, thông tin kết nối MQTT và CA nếu dùng TLS. Môi trường kiểm thử đã dùng Python 3.14 và MySQL 5.7.44; không yêu cầu máy khác có đúng đường dẫn hoặc cổng của máy bàn giao.

## 1. Cài Python packages và tạo cấu hình riêng

```bat
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
copy backend\settings.example.json backend\settings.local.json
copy .env.example .env
```

Chỉ copy file mẫu khi chưa có settings.local.json. Nếu đã cấu hình, sửa file đang có để không mất thông tin kết nối. Cập nhật code/package không cần tạo lại môi trường ảo.

## 2. Chuẩn bị MySQL

Kết nối MySQL Workbench tới server của bạn. Với database mới, mở và chạy theo thứ tự:

1. database/init.sql: tạo iot_db và 12 bảng chuẩn.
2. database/seed_demo.sql: tùy chọn cho môi trường test; tạo phòng 101/102 và node01/node02 active/active.
3. database/test_data.sql: tùy chọn cho test API; tạo user 1001 admin, 1002 owner, 1003 tenant và phòng T-OWN.

Không chạy init.sql trên DB đã có bảng. Với DB cũ, sao lưu rồi làm bước migration bên dưới bằng tài khoản đủ quyền DDL.

Tạo tài khoản ứng dụng riêng, ví dụ khi BE kết nối MySQL bằng TCP 127.0.0.1. Thay mật khẩu trong dấu nháy bằng giá trị riêng của bạn:

```sql
CREATE USER IF NOT EXISTS 'iot_app'@'127.0.0.1'
IDENTIFIED BY '<mat-khau-MySQL-rieng>';
GRANT SELECT, INSERT, UPDATE ON iot_db.* TO 'iot_app'@'127.0.0.1';
```

Nếu user đã tồn tại, CREATE USER IF NOT EXISTS không đổi mật khẩu. Dùng thông tin quản trị MySQL của môi trường đó để cấp/chỉnh quyền. Tài khoản migration cần thêm CREATE/ALTER/INDEX/REFERENCES phù hợp; sau migration, chạy BE bằng tài khoản ứng dụng.

Dữ liệu demo là dữ liệu test. Các password_hash có chữ DEMO không dùng để đăng nhập; user mẫu mặc định locked. Thông tin MQTT trong SQL không tự tạo tài khoản trên broker. Xem [database README](../database/README.md).

## 3. Cấu hình MySQL trong .env và MQTT trong backend/settings.local.json

Điền IOT_MYSQL_HOST, IOT_MYSQL_PORT, IOT_MYSQL_USER, IOT_MYSQL_PASSWORD, IOT_MYSQL_DATABASE và tùy chọn IOT_MYSQL_SSL_CA trong `.env`. Cả SQLAlchemy và PyMySQL dùng chung cấu hình này. Không dùng mật khẩu/CA từ máy người bàn giao. Khung MySQL trong `.env.example` dùng giá trị mẫu.

```json
{
  "mqtt_host": "<hostname-broker>",
  "mqtt_port": 8883,
  "mqtt_topic": "iot/devices/+/telemetry",
  "mqtt_client_id": "iot-backend-local",
  "mqtt_tls": true,
  "mqtt_ca_certs": "C:/certs/mqtt-ca.pem",
  "discovery_enabled": false,
  "emqx_admin": {
    "deployment": "disabled",
    "base_url": "",
    "policy_verified": false,
    "legacy_node_usernames": {},
    "timeout_s": 5
  }
}
```

Thay mọi placeholder; file CA phải tồn tại. Với broker LAN không TLS, đặt mqtt_tls=false và cổng đúng cấu hình broker. Client ID của BE phải riêng, tránh trùng ESP/MQTTX/backend khác. Topic giữ nguyên iot/devices/+/telemetry.

MySQL dùng đúng cổng server đang chạy. Cổng 13317 và datadir test-output/mysql-long-review/data là instance test đã tạo riêng trên máy bàn giao, không được đóng gói trong Git. Máy mới không tự có MySQL ở 13317.

Backend đọc `.env` cho MySQL, JWT, mật khẩu MQTT và thông tin EMQX; biến môi trường tiến trình được ưu tiên. MQTT host/port/TLS/CA và tùy chọn EMQX không bí mật có thể để trong settings.local.json. Không đưa file cấu hình riêng, CA cục bộ, token hoặc khóa vào commit.

## 4. Kiểm tra hoặc nâng cấp schema

Dừng BE trước khi migration; load_settings cần cấu hình MQTT hợp lệ và .env cần IOT_MYSQL_* hợp lệ kể cả khi chỉ kiểm tra DB.

```bat
.venv\Scripts\python.exe backend/migrate.py --check
```

Với DB mới từ init.sql, dự kiến không có thay đổi cần áp dụng. Nếu DB cũ có thay đổi, sao lưu, dùng tài khoản migration rồi chạy:

```bat
.venv\Scripts\python.exe backend/migrate.py --apply
```

Xong thì dùng lại tài khoản ứng dụng trước khi chạy server. Migration không thay thế backup và không tự xóa dữ liệu trùng để sửa schema.

## 5. JWT và tài khoản

API `POST /api/auth/login` cấp JWT cho tài khoản hoạt động trong MySQL. Đặt `JWT_SECRET` riêng, dài ít nhất 32 ký tự trong `.env` ở gốc repo hoặc trong cửa sổ CMD sẽ chạy backend.

```bat
set "JWT_SECRET=<khoa-JWT-rieng>"
```

Thay placeholder bằng khóa thực tế; không dùng nguyên chuỗi ví dụ. `set` chỉ áp dụng cho cửa sổ CMD hiện tại. Giữ cùng khóa khi khởi động lại nếu muốn token chưa hết hạn tiếp tục dùng được.

Có thể sinh khóa dùng riêng cho môi trường thử bằng lệnh sau.

```bat
.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```

Dùng kết quả làm `JWT_SECRET` cho môi trường thử. Để dùng admin mẫu, áp dụng `database/test_data.sql` vào database thử, chọn đúng schema thử trong Workbench rồi chạy các câu SQL sau.

```sql
UPDATE users SET status = 'active' WHERE user_id = 1001 AND username = 'test_admin';
SELECT user_id, role, status FROM users WHERE user_id = 1001;
```

Trỏ cấu hình MySQL của backend tới database thử. Từ gốc repo, đặt mật khẩu cho `test_admin` bằng script sau. Script hỏi username và mật khẩu mới. Sau khi chạy backend ở bước 6, dùng tài khoản này để đăng nhập web hoặc gọi `POST /api/auth/login` và lấy `accessToken` để thử API.

```bat
cd backend
..\.venv\Scripts\python.exe -m scripts.set_demo_password
cd ..
```

Với user 1002/1003, đặt mật khẩu, kích hoạt và kiểm tra quan hệ nhà/phòng trước khi thử quyền theo vai trò.

Nếu dùng PowerShell: đặt `$env:JWT_SECRET = '<khoa-rieng>'` thay cho lệnh set của CMD, rồi chạy các lệnh Python trong cùng cửa sổ đó.

## 6. Chạy server và gọi API

```bat
.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --workers 1
```

Đợi Application startup complete. Chỉ chạy một BE/worker trên mỗi DB. Nhấn Ctrl+C để dừng; sau khi sửa source phải dừng rồi chạy lại để nạp code.

- http://127.0.0.1:8000/api/health: công khai; mqtt.connected=true xác nhận BE đã nối và subscribe thành công, không chứng minh mọi node đã được cấp quyền đúng.
- http://127.0.0.1:8000/docs: Swagger. Bấm Authorize, dán riêng token, không thêm chữ Bearer. Xóa token cũ bằng Logout khi đổi tài khoản.
- GET /api/devices và GET /api/history?device_id=node01: cần token hợp lệ.
- http://127.0.0.1:8000/: trang thử API. Để mở website React, làm theo [hướng dẫn frontend](../frontend/README.md).

Mặc định backend chỉ nghe trên máy local. Khi triển khai cho thành viên khác, thống nhất địa chỉ backend, reverse proxy HTTPS và cấu hình frontend.

## 7. Test chức năng và giới hạn hiện tại

- Nhận dữ liệu: gửi telemetry đúng schema/topic, node đã active/active; kiểm tra history theo device_id + boot_id + seq, tránh nhầm với dữ liệu ESP đang gửi liên tục.
- Khóa/mở và bảo trì/hoạt động: làm theo [BE_LIFECYCLE_TEST](BE_LIFECYCLE_TEST.md). Chỉ gửi lifecycle_status và ghi chú tùy chọn; xóa credential_status khỏi body mẫu Swagger.
- POST /api/devices/register chỉ tạo registry registered/pending, chưa tạo tài khoản EMQX.
- POST mqtt-credentials với provision/revoke/reissue cần API quản trị broker tương thích. Cấu hình disabled/Serverless hiện trả incomplete; khi đã bắt đầu thu hồi, BE giữ chặn node. Không dùng thao tác này để thử khóa tạm BE.
- Chưa có API xác nhận cấp thủ công cho node mới trên Serverless. Dữ liệu seed active/active phục vụ ingestion test, không phải quy trình onboarding hoàn chỉnh.
- Dùng tài khoản thử để kiểm tra quyền với dữ liệu lịch sử và lệnh điều khiển. Đối chiếu ACK với còi/LED trên từng node.

Kiểm thử phần mềm:

```bat
.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
.venv\Scripts\python.exe -m unittest discover -s tests/backend -v
```

Bộ MySQL riêng chỉ chạy theo [tests README](../tests/README.md), không trỏ test script vào DB vận hành. Kết quả đã chạy và giới hạn bằng chứng ở [LONG_IMPLEMENTATION_STATUS](LONG_IMPLEMENTATION_STATUS.md).

## 8. Lỗi thường gặp

| Lỗi | Cách kiểm tra |
|---|---|
| `& was unexpected at this time` | Đang dùng cú pháp PowerShell trong CMD; dùng đúng các lệnh bat trong hướng dẫn này. |
| JWT_SECRET thiếu hoặc ngắn | Đặt khóa trong `.env` hoặc đúng cửa sổ chạy BE rồi chạy lại. |
| Database đã có backend hoặc migration | Dừng phiên BE/migration cũ; dùng workers=1. Không khởi động thêm để thay phiên cũ. |
| 401 token không hợp lệ/hết hạn | Token có đúng khóa ký của BE, còn hạn và được copy riêng chuỗi JWT không? |
| 401 tài khoản không hoạt động/quyền đổi | Kiểm tra users.status=active và role SQL trùng token, đúng database. |
| 403 | Kiểm tra vai trò và phạm vi nhà/phòng của tài khoản. |
| 409 khi mở lại | Xem credential, MQTT sync và audit tạm dừng; không dùng active để bỏ qua thu hồi chưa hoàn tất. |
| 422 password ngắn | provision/reissue cần 16–128 ký tự; revoke chỉ gửi action, không gửi password mẫu. |
| MQTT không kết nối | Đối chiếu hostname, cổng, tài khoản BE, CA/TLS và Client ID; tài khoản MySQL/JWT không thay tài khoản MQTT. |
| SQL không giống JSON vừa gửi | Lọc đúng device_id/boot_id/seq. Các ESP thật có thể đang ghi thêm bản tin. |
| Giờ SQL chậm hơn giờ Việt Nam 7 tiếng | Backend lưu UTC; khi hiển thị đổi sang Asia/Ho_Chi_Minh, không đổi dữ liệu lưu chỉ để khớp giờ máy. |
