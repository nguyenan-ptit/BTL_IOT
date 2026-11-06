# Trạng thái sửa theo checklist của Long — cập nhật 07/11/2026

Tài liệu phân biệt phần đã có trong code, đã kiểm thử và còn cần tích hợp theo CHECKLIST_CONG_VIEC_LONG.md. Backend đã dùng MySQL và có quan sát telemetry thật trên DB test local; chưa có deployment production và chưa hoàn tất toàn bộ checklist. Hướng dẫn máy nhận: [RUN_BACKEND_WINDOWS](RUN_BACKEND_WINDOWS.md); bản ngắn gửi nhóm: [HANDOVER_SUMMARY](HANDOVER_SUMMARY.md).

## Đối chiếu phạm vi

| Mục checklist | Đã triển khai và kiểm tra cục bộ | Còn cần môi trường/đồng đội |
|---|---|---|
| 1. Ingestion | Chỉ active/active; kiểm tra registry; chống trùng toàn bộ ID; khóa dòng chống race; đã quan sát node01/node02 ghi MySQL qua EMQX và bản tin MQTTX riêng | Nghiệm thu đủ reconnect, restart, chống trùng và lỗi trên môi trường nhóm |
| 2. MQTT | Adapter API v5; cấu hình admin riêng; cấp/thu hồi/cấp lại; tài khoản mới; ACL topic riêng; tra username/ngắt Client ID thực; journal/audit/retry | Cấu hình Serverless hiện tại chưa hỗ trợ adapter, admin đang disabled; chưa nghiệm thu quản lý tài khoản/ACL/ngắt phiên và từ chối thông tin cũ trên broker thật |
| 3. Lịch sử lệnh | Commit queued trước publish; người gửi/phòng/payload; ACK/timeout; xử lý mất DB/MQTT, restart; API lịch sử bền vững | ACK và đầu ra trên ESP thật |
| 4. Metadata/phòng/vòng đời | last_seen_at chỉ đổi khi INSERT mới; metadata/chuyển phòng + audit; node chưa online vẫn được liệt kê; khóa/mở và bảo trì/hoạt động có kiểm tra nhật ký, không đổi thông tin MQTT | Người dùng nghiệm thu lifecycle trên môi trường thật; luồng QTV đăng ký trước/chủ trọ nhận sau cần nhóm quyết định |
| 5. Lọc lịch sử | ISO 8601 có múi giờ, kiểm tra thứ tự, UTC, SQL tham số và phạm vi phòng đã ghi | Chưa phân trang vượt 100 mẫu; không nằm trong yêu cầu hiện tại |
| 6. Phân quyền | Adapter JWT; kiểm tra account active và role DB; owner theo house, tenant theo room_users; đã thử các tài khoản fixture | Vĩ cung cấp đăng ký/đăng nhập và JWT thật; Nguyên nối frontend vào API |
| 7. Schema/migration | init.sql duy nhất; migration lặp lại được, giữ history; hỗ trợ schema cũ 50 ký tự; sửa index tiền tố; UTC từng phiên; lỗi DB được che thông tin | Sao lưu rồi chạy migration trên môi trường nhóm; đối chiếu múi giờ dữ liệu cũ nếu từng dùng NOW() sai múi giờ |
| 8. Kiểm thử/bàn giao | README MySQL/CMD, cấu hình mẫu, API/request/response/lỗi; smoke script hỗ trợ token dịch vụ tài khoản và ID 1001/1002/1003 | Chưa chạy smoke bằng đăng nhập thật; còn nghiệm thu EMQX admin, hai node/phần cứng và deploy |

## Kết quả đã chạy

### Bổ sung ngày 07/11/2026: khóa/mở lại và bảo trì tại BE

- Sửa ngay PATCH lifecycle: node đã active/active với mqtt_sync_status=unknown có thể tạm blocked/maintenance rồi trở lại active nếu nhật ký tạm dừng xác nhận cùng thông tin MQTT. Không đổi unknown thành synced, không cấp/thu hồi tài khoản broker.
- Nhật ký được lưu trong DB; sửa ghi chú hoặc chuyển maintenance sang blocked vẫn giữ được khả năng mở lại. Kích hoạt lần đầu, credential pending/revoked, thông tin MQTT đổi và thao tác MQTT pending/failed vẫn bị từ chối.
- Khi khóa/bảo trì, các lệnh đang chờ được ghi interrupted. Không gửi thêm lệnh vật lý và không khẳng định đã hủy lệnh từng đến ESP.
- Kiểm thử sau sửa: **45/45 ca cô lập đạt**; **9/9 ca lifecycle trên MySQL 5.7 riêng đạt**. MySQL dùng database test tên ngẫu nhiên, không thay đổi trạng thái node của iot_db. Broker/token trong các ca này vẫn là fixture.
- Hướng dẫn người dùng tự nghiệm thu với ESP/EMQX đang chạy: [BE_LIFECYCLE_TEST](BE_LIFECYCLE_TEST.md). Cần khởi động lại backend đang chạy để nạp code mới.

### Mốc kiểm thử ban đầu ngày 06/11/2026

- Bộ cô lập: **37/37 đạt**. API/controller chạy thật trong tiến trình, lưu qua adapter SQLite, MQTT/EMQX giả; token là fixture, không chứng minh đăng nhập thật.
- Bộ MySQL chính trên bản cuối: **36/36 đạt**, gồm startup/shutdown. MySQL **5.7.44** chạy riêng trên 127.0.0.1:13317, datadir test-output/mysql-long-review/data, database tên ngẫu nhiên. Không sử dụng database của dịch vụ MySQL57 đang chạy.
- Startup/shutdown: backend lấy/nhả khóa DB, worker timeout chạy khi không có lượt gọi dashboard. API lọc thời gian được chạy lại trên MySQL sau khi siết định dạng ISO 8601: đạt.
- Migration từ cả database/init.sql và database/init_db.sql tại commit f6f2e7b: đạt; giữ history và trạng thái cũ; lần chạy lại không có DDL mới. Kiểm tra sửa unique index tiền tố và khôi phục FK bị thiếu sau gián đoạn: đạt.
- Tranh chấp thực trên MySQL: ingestion chờ giao dịch thu hồi giữ khóa; sau khi commit revoked, bản tin bị từ chối và không có dòng history mới.
- Python compile/import/OpenAPI và cú pháp JavaScript dashboard: đạt. Đây không phải kiểm thử hình ảnh hay nghiệm thu frontend React.

Lệnh chạy từ gốc repo:

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests/backend -v
.venv/Scripts/python.exe tests/backend/mysql_integration.py
```

Bằng chứng JSON của mốc 37/36 được lưu cục bộ trong test-output/mysql-long-review/isolated-results.json và mysql-results.json; thư mục test-output được Git bỏ qua. Mốc 45/9 sau sửa lifecycle được xác nhận bằng kết quả chạy unittest trong phiên sửa; không gán các file JSON mốc cũ cho lần chạy mới. Cách dựng/dừng server thử riêng ở [tests/README](../tests/README.md). Không cộng các lần chạy lại thành số ca riêng và không tính broker/token giả là nghiệm thu EMQX hoặc đăng nhập thật.

Instance MySQL test riêng dùng cổng 13317 và datadir dưới test-output, do người chạy chủ động bật/tắt. Đây là cấu hình của máy bàn giao, không phải server đi kèm khi clone repo. Dữ liệu thử không được đóng gói hoặc đưa vào Git.

## Việc cần cung cấp để chạy hệ thống nhóm

1. Điền kết nối MySQL/MQTT thật trong backend/settings.local.json hoặc IOT_MYSQL_*/IOT_MQTT_*; giữ mật khẩu ngoài Git. Sao lưu DB, dừng backend, chạy migrate.py --check rồi --apply.
2. Người 3 cung cấp dịch vụ đăng nhập/token và JWT_SECRET dùng chung. Token cần user_id, role admin/owner/tenant và exp; user trong DB phải active. Dữ liệu mẫu locked/hash giả không dùng để đăng nhập thật.
3. Xác định deployment EMQX và URL quản trị; cấu hình khóa API ở local/env. Đối chiếu policy và các username cũ trước khi bật policy_verified. Không gửi khóa vào chat hoặc đưa vào firmware/frontend.
4. Chạy capabilities và nghiệm thu node thử trên deployment: tạo tài khoản, topic ACL, thu hồi/ngắt phiên, thử kết nối lại bằng thông tin cũ, lỗi và retry. Nếu Serverless thiếu API cần thiết, chức năng tự động giữ trạng thái chưa hoàn tất; nhóm cần chọn cách xử lý theo [LONG_API](LONG_API.md).
5. Người 1 nạp username/password mới cho ESP, kiểm tra xong mới kích hoạt. Người 4 tích hợp API và hiển thị processing/succeeded/incomplete; frontend mock hiện có chưa được tự chuyển hợp đồng.

Chi tiết endpoint, mã lỗi, trạng thái và cấu hình EMQX: [LONG_API](LONG_API.md). Hướng dẫn vận hành: [backend/README](../backend/README.md), [database/README](../database/README.md).
