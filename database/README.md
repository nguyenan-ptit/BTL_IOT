# Database — MySQL

[init.sql](init.sql) là nguồn schema duy nhất. Backend dùng PyMySQL; không dùng SQLite trong vận hành. Yêu cầu MySQL 5.7.8+ với InnoDB/utf8mb4 và JSON; bản đã kiểm thử ghi trong [trạng thái triển khai](../docs/LONG_IMPLEMENTATION_STATUS.md).

## Database mới

Trong MySQL client, chạy theo thứ tự:

Nếu dùng MySQL Workbench, mở từng file bằng File → Open SQL Script rồi chạy trên đúng connection, theo thứ tự dưới đây. `SOURCE` là lệnh của mysql CLI, không phải câu SQL để dán vào Workbench. Schema mẫu chọn database `iot_db`; nếu nhóm dùng tên khác cần điều chỉnh thống nhất script và cấu hình BE.

~~~sql
SOURCE database/init.sql;
-- Dữ liệu mô phỏng tùy chọn, chỉ cho môi trường thử:
SOURCE database/seed_demo.sql;
SOURCE database/test_data.sql;
~~~

init.sql tạo 12 bảng gồm registry, history, lệnh, audit, mqtt_operations và schema_migrations. Không chạy lại init.sql trên DB đã có bảng. Không xóa DB vận hành để nâng cấp.

seed_demo.sql tạo node01/node02 active/active để thử ingestion, nhưng mqtt_sync_status vẫn unknown: dữ liệu mẫu không chứng minh broker đã cấp tài khoản. test_data.sql dùng admin=1001, owner=1002, tenant=1003, phòng T-OWN. Các tài khoản mẫu locked và hash không phải mật khẩu thật; người 3 chuẩn bị tài khoản đăng nhập trước khi chạy smoke test với token thật.

## Nâng cấp database cũ

Dừng backend và sao lưu bằng công cụ MySQL trước khi --apply. MySQL DDL tự commit; nếu gián đoạn, giữ backend dừng và chạy lại migration. Công cụ đọc định nghĩa mới từ init.sql, không duy trì bản CREATE TABLE thứ hai.

~~~powershell
# Cấu hình kết nối DB cần nâng cấp bằng settings.local.json hoặc IOT_MYSQL_*.
.venv/Scripts/python.exe backend/migrate.py --check
.venv/Scripts/python.exe backend/migrate.py --apply
~~~

Migration 20261106_01 hỗ trợ hai schema tại commit f6f2e7b: init.sql và init_db.sql cũ. Nó thêm các cột đồng bộ MQTT và bảng thao tác/mốc migration, tạo device_commands nếu thiếu, nâng device_id VARCHAR(50) thành VARCHAR(64) trong schema cũ, giữ/ràng buộc lại khóa ngoại và bảo đảm khóa chống trùng toàn bộ device_id + boot_id + seq. Không xóa dòng telemetry, tài khoản, sự cố, lệnh hoặc audit. Nếu phát hiện mẫu trùng hay cấu trúc ngoài phạm vi hỗ trợ, công cụ dừng để xử lý riêng.

--check chỉ đọc và hiển thị kế hoạch. --apply chạy lại được: chỉ thêm phần còn thiếu rồi kiểm tra schema. Khóa MySQL ngăn chạy migration đồng thời với backend khác. Cờ version chỉ ghi sau khi DDL hoàn tất; backend kiểm tra cả mốc migration lẫn các cột thực tế trước khi chạy.

Thiết bị cũ giữ nguyên lifecycle_status và credential_status; mqtt_sync_status=unknown. Không tự coi cờ DB là bằng chứng đã thu hồi/cấp thành công trên broker. Tài khoản MQTT cũ cần đối chiếu với deployment và khai báo legacy_node_usernames trong cấu hình quản trị trước khi tự động thu hồi; xem [LONG_API](../docs/LONG_API.md).

## Thời gian, quyền và bảo toàn dữ liệu

Backend đặt time_zone='+00:00' trên từng kết nối, dùng UTC_TIMESTAMP() cho thao tác và DATETIME UTC cho telemetry/lệnh. Phản hồi API có +00:00. Dữ liệu cũ từng ghi bằng NOW() có thể đã lệch múi giờ: migration không đoán múi giờ và không tự đổi lịch sử; cần đối chiếu nguồn nếu dữ liệu thực tế bị lệch.

history.room_id và device_commands.room_id là phòng tại thời điểm ghi, không cập nhật khi đổi devices.room_id. Phân quyền lịch sử dùng chính phòng đã ghi. room_users được kiểm tra theo started_at/ended_at. Tài khoản locked hoặc role DB khác token bị từ chối ở mọi API được bảo vệ.

device_commands lưu request_id duy nhất, người gửi, phòng, payload lệnh, hạn chờ và kết quả ACK/timeout. response_payload chỉ giữ bằng chứng ACK liên quan, không chép số đo của phòng mới vào lệnh phòng cũ.

mqtt_operations lưu trạng thái từng thao tác, username đích, danh sách username cần thu hồi, kết quả từng bước và mã lỗi an toàn. Mật khẩu MQTT không lưu dạng thuần: password_digest dùng PBKDF2 để kiểm tra đầu vào khi thử lại cùng thao tác. Khóa quản trị EMQX không lưu trong database. Mỗi lần cấp/cấp lại dùng username mới; mật khẩu do người gọi cung cấp và chuyển riêng cho người nạp ESP.

## Tài khoản MySQL

Dùng tài khoản ứng dụng riêng trên đúng database, có SELECT/INSERT/UPDATE; không cần quyền DROP/ALTER khi vận hành. Tài khoản migration cần CREATE/ALTER/INDEX/REFERENCES tương ứng với schema. Quyền tài khoản, host và TLS do nhóm cấu hình theo môi trường; không commit mật khẩu hoặc chuỗi kết nối thật.

## Kiểm tra sau triển khai

~~~sql
SELECT version, applied_at FROM schema_migrations;
SHOW INDEX FROM history;
SELECT device_id, room_id, lifecycle_status, credential_status, mqtt_sync_status, last_seen_at FROM devices;
SELECT request_id, requested_by, room_id, status, requested_at, finished_at FROM device_commands ORDER BY command_id DESC LIMIT 20;
SELECT operation_id, action, status, steps, error_code FROM mqtt_operations ORDER BY created_at DESC LIMIT 20;
~~~

Các lệnh SQL trên dùng để kiểm tra trạng thái đã lưu. Khả năng kết nối lại bằng thông tin cũ, ACL và đầu ra vật lý phải được nghiệm thu riêng trên EMQX/ESP thật.
