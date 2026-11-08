# Backend — FastAPI, MQTT và MySQL

Backend nhận telemetry từ ESP, lưu MySQL và cung cấp API có xác thực để quản lý thiết bị, đọc dữ liệu và điều khiển. Xem [hợp đồng API và EMQX](../docs/LONG_API.md), [nâng cấp database](../database/README.md) và [kết quả kiểm thử](../docs/LONG_IMPLEMENTATION_STATUS.md).

Người nhận chạy trên Windows CMD nên bắt đầu ở [RUN_BACKEND_WINDOWS](../docs/RUN_BACKEND_WINDOWS.md): cài môi trường, tạo DB/user, cấu hình MQTT TLS, đặt JWT_SECRET, tạo token test và xử lý lỗi thường gặp. [HANDOVER](../docs/HANDOVER.md) phân chia phần Long/Vĩ/Nguyên và việc còn thiếu; [bản tóm tắt gửi nhóm](../docs/HANDOVER_SUMMARY.md) có thể copy trực tiếp.

## Chuẩn bị và chạy

Chạy từ thư mục gốc repository:

~~~powershell
py -m venv .venv
.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
Copy-Item backend/settings.example.json backend/settings.local.json
Copy-Item .env.example .env
~~~

Điền MySQL và JWT trong `.env`; cấu hình MQTT/EMQX trong settings.local.json hoặc biến môi trường. Không commit file local, mật khẩu, CA riêng hoặc khóa.

JWT_SECRET phải trùng với dịch vụ tài khoản của người 3, ít nhất 32 ký tự. Token phải có user_id kiểu số nguyên, role và exp. Mỗi request được kiểm tra lại tài khoản đang active và role hiện tại trong MySQL; token của tài khoản locked bị từ chối. Không có khóa JWT mặc định và backend này không tự xây lại luồng đăng nhập.

Tạo database mới hoặc chạy migration theo [database/README](../database/README.md), sau đó:

~~~powershell
.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --workers 1
~~~

Mỗi database chỉ cho phép một backend; khóa MySQL ngăn worker thứ hai và migration chạy khi backend còn hoạt động. Worker giữ khóa sống trong suốt phiên. Nếu mất kết nối giữ khóa, backend dừng nhận MQTT và từ chối điều khiển cho đến khi khởi động lại. Khi triển khai ra mạng cần reverse proxy HTTPS.

Dashboard thử tại http://127.0.0.1:8000/ hoặc /dashboard nhận mã truy cập từ dịch vụ tài khoản. Mã chỉ giữ trong bộ nhớ trang, bị xóa khi đóng phiên/tải lại. Đây là màn thử API, không thay thế giao diện đăng nhập của người 4. OpenAPI ở /docs.

## Cấu hình

- MQTT backend: mqtt_host, mqtt_port, TLS và topic trong settings.local.json; username/password qua IOT_MQTT_USERNAME và IOT_MQTT_PASSWORD trong `.env` hoặc môi trường tiến trình. Topic phải là iot/devices/+/telemetry.
- MQTT TLS: mqtt_tls=true và mqtt_ca_certs trỏ tới CA tin cậy. Không bỏ qua kiểm tra chứng chỉ.
- MySQL: một nguồn duy nhất là `IOT_MYSQL_*` trong `.env` (hoặc biến môi trường tiến trình); cả SQLAlchemy và PyMySQL dùng cùng giá trị. `IOT_MYSQL_SSL_CA` tùy chọn.
- EMQX quản trị: cấu hình không bí mật có thể ở khối emqx_admin; API URL/key/secret, deployment và policy verification nhận IOT_EMQX_* từ `.env` hoặc môi trường tiến trình. Key/secret tách biệt với tài khoản MQTT của backend và node. Chi tiết và giới hạn Serverless ở [LONG_API](../docs/LONG_API.md).
- settings.local.json và .env không được commit. Mẫu để trống mọi bí mật; thiếu mật khẩu MySQL hoặc JWT_SECRET thì backend không khởi động.

## Hành vi dữ liệu và điều khiển

Chỉ node đã đăng ký, lifecycle_status=active và credential_status=active mới ghi được telemetry. registered, provisioned, maintenance, blocked, decommissioned, pending và revoked đều bị từ chối. Receiver tiếp tục xử lý các node khác. Topic phải khớp device_id và không được retained.

PATCH lifecycle với blocked/maintenance chỉ tạm dừng tại BE, giữ thông tin MQTT và ngắt theo dõi các lệnh đang chờ bằng trạng thái interrupted. Node đã active trước đó có thể mở lại bằng PATCH active: nếu mqtt_sync_status=unknown, cần nhật ký tạm dừng phù hợp và thông tin MQTT không đổi. Đây không phải đường kích hoạt lần đầu hoặc bỏ qua thu hồi; pending/revoked và thao tác MQTT pending/failed vẫn bị chặn. Xem [các bước test khóa/mở và bảo trì](../docs/BE_LIFECYCLE_TEST.md).

Khóa chống trùng dùng toàn bộ device_id + boot_id + seq. Chỉ lần INSERT mới cập nhật last_seen_at và phiên bản tùy chọn trong telemetry. Timestamp API có UTC. Firmware hiện tại không bắt buộc gửi phiên bản; người quản lý có thể cập nhật qua PATCH thiết bị.

Danh sách xuất phát từ registry, có cả node chưa gửi dữ liệu. data=null khi chưa có telemetry trong phòng hiện tại. Vòng đời, credential, kết nối online/offline và sức khỏe cảm biến là các trường riêng. Chuyển phòng không sửa history/incidents/device_commands cũ. Dữ liệu lịch sử được lọc theo room_id đã ghi; mẫu của phòng cũ không xuất hiện như dữ liệu hiện tại ở phòng mới.

Lệnh đổi ngưỡng/thử còi phải có quyền admin/owner đúng phòng và node được phép điều khiển. Backend ghi queued vào device_commands và commit trước khi publish; nếu không ghi được DB thì không gửi MQTT. Publish thành công chỉ chuyển pending. Chỉ telemetry khớp request/boot/revision hoặc command_seq xác nhận kết quả ESP. Worker nhận ACK và xử lý timeout độc lập với dashboard.

Lỗi vận chuyển có thể để lệnh ở unconfirmed: không khẳng định ESP đã hoặc chưa thực hiện. Không tự phát lại lệnh vật lý. Khởi động lại đóng các dòng chưa hoàn tất thành timeout hoặc interrupted; lịch sử đã ghi vẫn còn. Chuyển phòng ngắt theo dõi lệnh cũ, giữ nguyên phòng/người gửi lịch sử.

## Kiểm thử

~~~powershell
.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
.venv/Scripts/python.exe -m unittest discover -s tests/backend -v
~~~

Bộ mặc định chạy API thật trong tiến trình với adapter SQLite và broker giả. Nó kiểm tra quy tắc dữ liệu, phân quyền, lịch sử, ACK/timeout, lỗi và thử lại; không chứng minh MQTT/TLS/phần cứng thật.

[mysql_integration.py](../tests/backend/mysql_integration.py) chạy lại API và migration trên MySQL tạm riêng ở 127.0.0.1:13317. Script kiểm tra datadir trước mọi thao tác tạo DB và không chạm dịch vụ MySQL đang dùng. Cách chạy và bằng chứng ở [trạng thái triển khai](../docs/LONG_IMPLEMENTATION_STATUS.md).

scripts/test_devices.py là smoke test có thay đổi dữ liệu, chỉ chạy trên DB thử. Cấp ba token từ luồng đăng nhập thật qua IOT_TEST_ADMIN_TOKEN, IOT_TEST_OWNER_TOKEN, IOT_TEST_TENANT_TOKEN. Script không tự ký token và không đọc JWT_SECRET. Dữ liệu mẫu dùng ID 1001/1002/1003 nhưng tài khoản mặc định locked, hash giả; cần người 3 chuẩn bị tài khoản đăng nhập thật trước.

## Phối hợp còn cần

Người 3 cung cấp đăng nhập/cấp token và quản lý tài khoản; người 4 tích hợp các API trong LONG_API. Frontend React hiện vẫn có hợp đồng /api/nodes, /api/auth/* và mock riêng, chưa tự chuyển thành khách hàng của các API thiết bị này. Người 1 cập nhật username/password mới lên ESP trước khi kích hoạt, và nghiệm thu ngưỡng, còi/LED thực tế.
