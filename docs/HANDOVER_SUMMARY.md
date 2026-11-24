# Tóm tắt bàn giao nhóm

Backend FastAPI và MySQL đã nhận telemetry từ node01/node02 qua EMQX Cloud trong buổi test local. API hỗ trợ đăng ký và quản lý node, chuyển phòng, lọc lịch sử, xác thực JWT và ghi nhận lệnh, ACK, timeout. PATCH lifecycle hỗ trợ mở lại node bị khóa và đưa node ra khỏi bảo trì. Tài khoản MQTT được giữ khi tạm dừng.

Tại mốc 07/11/2026, 45 ca cô lập và 9 ca lifecycle trên MySQL riêng đã đạt. Bộ kiểm thử dùng broker và token fixture. Nghiệm thu EMQX, đăng nhập và phần cứng cần được ghi riêng.

Phân công tiếp:

- Nguyễn Văn An phụ trách phần cứng, firmware ESP8266, cập nhật firmware qua mạng (FOTA), kết nối MQTT trên node và kiểm thử ngưỡng, ACK, còi, LED.
- Đặng Kỳ Vĩ phụ trách backend, đăng nhập, xác thực, JWT và quản lý trạng thái, vai trò tài khoản.
- Vũ Thành Nguyên phụ trách frontend React, tích hợp API, luồng đăng nhập và cơ sở dữ liệu MySQL.

Frontend gọi FastAPI để đăng nhập và lấy dữ liệu thiết bị. Thao tác đăng ký node tạo bản ghi trong registry. Cấp, thu hồi và cấp lại tài khoản MQTT tự động cần broker có API quản trị tương thích. Ghi kết quả nghiệm thu theo từng ESP.

Từ gốc repo, tạo `.venv`, cài `backend/requirements.txt`, tạo `backend/settings.local.json`, cấu hình MySQL và `JWT_SECRET` trong `.env`, rồi khởi tạo hoặc nâng schema trước khi chạy một worker.

```bat
.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --workers 1
```

Swagger ở http://127.0.0.1:8000/docs. API dữ liệu và quản lý cần Bearer JWT của tài khoản đang hoạt động trong MySQL. `/api/health` công khai. Backend đọc `.env` ở gốc repo. Xem [hướng dẫn frontend](../frontend/README.md) để chạy giao diện React.

Tài liệu cần đọc: [chạy từ đầu trên Windows CMD](RUN_BACKEND_WINDOWS.md), [hợp đồng API](LONG_API.md), [test khóa/mở và bảo trì](BE_LIFECYCLE_TEST.md), [schema/migration](../database/README.md), [phân công bàn giao](HANDOVER.md) và [trạng thái kiểm thử](LONG_IMPLEMENTATION_STATUS.md).
