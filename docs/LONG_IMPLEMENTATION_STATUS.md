# Trạng thái sửa theo checklist của Long — 06/11/2026

Đã triển khai theo CHECKLIST_CONG_VIEC_LONG.md được cung cấp. Chưa áp dụng migration hoặc cấu hình lên database/broker vận hành. Các thay đổi firmware có sẵn trong workspace được giữ nguyên.

## Đối chiếu phạm vi

| Mục checklist | Đã triển khai và kiểm tra cục bộ | Còn cần môi trường/đồng đội |
|---|---|---|
| 1. Ingestion | Chỉ active/active; kiểm tra registry; receiver từ chối có kiểm soát; chống trùng toàn bộ ID; khóa dòng chống race với thu hồi | Nghiệm thu telemetry của ESP thật trên DB nhóm |
| 2. MQTT | Adapter API v5; cấu hình admin riêng; cấp/thu hồi/cấp lại; tài khoản mới; ACL topic riêng; tra username/ngắt Client ID thực; trạng thái từng bước, audit, retry, xử lý một phần | Chưa xác minh deployment, key/quyền API thật, ACL và khả năng kết nối lại bằng thông tin cũ |
| 3. Lịch sử lệnh | Commit queued trước publish; người gửi/phòng/payload; ACK/timeout; xử lý mất DB/MQTT, restart; API lịch sử bền vững | ACK và đầu ra trên ESP thật |
| 4. Metadata/phòng | last_seen_at chỉ đổi khi INSERT mới; cập nhật/trả phiên bản; API chuyển phòng + audit; liệt kê node chưa online; giữ phòng lịch sử; tách vòng đời/kết nối/sensor | Firmware có thể bổ sung phiên bản tùy chọn; luồng QTV đăng ký trước/chủ trọ nhận sau chưa được nhóm quyết định |
| 5. Lọc lịch sử | ISO 8601 có múi giờ, kiểm tra thứ tự, UTC, SQL tham số và phạm vi phòng đã ghi | Chưa phân trang vượt 100 mẫu; không nằm trong yêu cầu hiện tại |
| 6. Phân quyền | Dùng adapter JWT hiện có; kiểm tra account active và role DB; owner theo house, tenant theo room_users; chặn điều khiển trái quyền | Người 3 cấp token từ luồng đăng nhập thật; người 4 nối frontend vào hợp đồng API |
| 7. Schema/migration | init.sql duy nhất; migration lặp lại được, giữ history; hỗ trợ schema cũ 50 ký tự; sửa index tiền tố; UTC từng phiên; lỗi DB được che thông tin | Sao lưu rồi chạy migration trên môi trường nhóm; đối chiếu múi giờ dữ liệu cũ nếu từng dùng NOW() sai múi giờ |
| 8. Kiểm thử/bàn giao | Cập nhật README MySQL, cấu hình mẫu, API/request/response/lỗi; smoke test dùng token thật và ID 1001/1002/1003 | Kiểm thử đăng nhập thật, EMQX thật, hai node và phần cứng |

## Kết quả đã chạy

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

Bằng chứng máy cục bộ được lưu trong test-output/mysql-long-review/isolated-results.json và mysql-results.json; thư mục test-output được Git bỏ qua. Cách dựng/dừng server thử riêng ở [tests/README](../tests/README.md). Không cộng các lần chạy lại thành số ca riêng và không tính broker/token giả là nghiệm thu EMQX hoặc đăng nhập thật.

Sau kiểm thử, server MySQL tạm ở 13317 đã được dừng; dịch vụ MySQL57 ban đầu vẫn chạy. Dữ liệu thử được giữ trong thư mục bị Git bỏ qua để đối chiếu.

## Việc cần cung cấp để chạy hệ thống nhóm

1. Điền kết nối MySQL/MQTT thật trong backend/settings.local.json hoặc IOT_MYSQL_*/IOT_MQTT_*; giữ mật khẩu ngoài Git. Sao lưu DB, dừng backend, chạy migrate.py --check rồi --apply.
2. Người 3 cung cấp dịch vụ đăng nhập/token và JWT_SECRET dùng chung. Token cần user_id, role admin/owner/tenant và exp; user trong DB phải active. Dữ liệu mẫu locked/hash giả không dùng để đăng nhập thật.
3. Xác định deployment EMQX và URL quản trị; cấu hình khóa API ở local/env. Đối chiếu policy và các username cũ trước khi bật policy_verified. Không gửi khóa vào chat hoặc đưa vào firmware/frontend.
4. Chạy capabilities và nghiệm thu node thử trên deployment: tạo tài khoản, topic ACL, thu hồi/ngắt phiên, thử kết nối lại bằng thông tin cũ, lỗi và retry. Nếu Serverless thiếu API cần thiết, chức năng tự động giữ trạng thái chưa hoàn tất; nhóm cần chọn cách xử lý theo [LONG_API](LONG_API.md).
5. Người 1 nạp username/password mới cho ESP, kiểm tra xong mới kích hoạt. Người 4 tích hợp API và hiển thị processing/succeeded/incomplete; frontend mock hiện có chưa được tự chuyển hợp đồng.

Chi tiết endpoint, mã lỗi, trạng thái và cấu hình EMQX: [LONG_API](LONG_API.md). Hướng dẫn vận hành: [backend/README](../backend/README.md), [database/README](../database/README.md).
