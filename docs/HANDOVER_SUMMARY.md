# Tóm tắt bàn giao nhóm — 07/11/2026

Phần BE của Long đã có FastAPI + MySQL, nhận telemetry thật từ node01/node02 qua EMQX Cloud trong buổi test local. API đã có đăng ký/quản lý node, chuyển phòng, đọc/lọc lịch sử, kiểm tra JWT và quyền theo phòng, lưu lịch sử lệnh/ACK/timeout. Đã sửa khóa → mở lại và bảo trì → hoạt động trong PATCH lifecycle; tài khoản MQTT cũ được giữ khi tạm dừng.

Kết quả phần mềm sau sửa: 45 ca cô lập và 9 ca lifecycle trên MySQL riêng đều đạt. Các bài này dùng broker/token fixture, không thay nghiệm thu EMQX/đăng nhập/phần cứng thật. Nhận được telemetry không chứng minh ACL hoặc thu hồi tài khoản broker đã hoàn tất.

Phân công tiếp:

- Long: bàn giao BE/API/MySQL, hoàn thiện quản trị MQTT phù hợp deployment, phối hợp tích hợp và deploy.
- Vĩ: API đăng ký/đăng nhập người dùng, băm mật khẩu, JWT, quản lý trạng thái/vai trò tài khoản; thống nhất bảng users và claims user_id/role/exp với Long.
- Nguyên: nối frontend React đang dùng mock với API thực tế và luồng đăng nhập của Vĩ; thống nhất request/response, token và mã lỗi.
- An: cấu hình/nạp đúng tài khoản MQTT riêng cho từng ESP và nghiệm thu ngưỡng, ACK, còi/LED trên từng bo.

Chưa hoàn tất: tự động cấp/thu hồi/cấp lại tài khoản MQTT trên deployment EMQX hiện tại; tích hợp đăng nhập của Vĩ và frontend của Nguyên; deployment chung và nghiệm thu đủ các ca trên ESP thật. Chưa có API đăng ký/đăng nhập người dùng trong BE của Long. Đăng ký node chỉ tạo registry, không tự tạo tài khoản EMQX. Không đánh dấu toàn bộ checklist Long là hoàn thành.

Cách chạy: từ gốc repo tạo .venv, cài backend/requirements.txt, tạo settings.local.json, khởi tạo MySQL hoặc migration, đặt JWT_SECRET cùng dịch vụ tài khoản, rồi chạy một worker:

```bat
.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --workers 1
```

Swagger: http://127.0.0.1:8000/docs. API dữ liệu/quản lý cần Bearer JWT của user active trong SQL; /api/health công khai. File .env không được tự nạp. Các file cấu hình, mật khẩu, CA cục bộ và DB test không có trong Git; máy nhận tự cấu hình, không phụ thuộc đường dẫn/cổng của máy bàn giao.

Tài liệu cần đọc: [chạy từ đầu trên Windows CMD](RUN_BACKEND_WINDOWS.md), [hợp đồng API](LONG_API.md), [test khóa/mở và bảo trì](BE_LIFECYCLE_TEST.md), [schema/migration](../database/README.md), [phân công bàn giao](HANDOVER.md) và [trạng thái kiểm thử](LONG_IMPLEMENTATION_STATUS.md).
