# Triển khai hệ thống giám sát cháy và gas

Hướng dẫn này chạy **backend FastAPI và frontend React trên Windows**, dùng MySQL để lưu dữ liệu và MQTT để nhận dữ liệu từ ESP8266. Node kết nối trực tiếp tới broker. Trình duyệt gọi API qua Vite.

## 1. Chuẩn bị MySQL và broker

- Với database mới, chạy [`database/init.sql`](../database/init.sql) trong MySQL và cấp quyền cho tài khoản backend. Với database đã có dữ liệu, sao lưu rồi kiểm tra và chạy migration theo [hướng dẫn MySQL](../database/README.md).
- Cấu hình broker MQTT và tạo tài khoản riêng cho backend và từng node. Nếu dùng EMQX Cloud, lấy hostname, cổng TLS và chứng chỉ CA theo [hướng dẫn MQTT Cloud](../docs/CLOUD_MQTT.md). Khi dùng broker LAN, dùng địa chỉ mà cả máy backend và ESP8266 đều truy cập được.

## 2. Chạy backend

Từ thư mục gốc repository, mở PowerShell và cài thư viện Python.

```powershell
if (-not (Test-Path .venv/Scripts/python.exe)) { py -3 -m venv .venv }
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
if (-not (Test-Path backend/settings.local.json)) {
    Copy-Item backend/settings.example.json backend/settings.local.json
}
```

| File | Cấu hình cần điền |
| --- | --- |
| `.env` | `IOT_MYSQL_HOST`, `IOT_MYSQL_PORT`, `IOT_MYSQL_USER`, `IOT_MYSQL_PASSWORD`, `IOT_MYSQL_DATABASE`, `IOT_MQTT_USERNAME`, `IOT_MQTT_PASSWORD` và `JWT_SECRET` riêng, dài ít nhất 32 ký tự. |
| `backend/settings.local.json` | Địa chỉ và cổng broker, `mqtt_client_id` riêng, `mqtt_topic` là `iot/devices/+/telemetry`. Nếu dùng TLS, đặt `mqtt_tls` thành `true` và `mqtt_ca_certs` trỏ tới tệp CA. Nếu dùng EMQX Cloud, tắt `discovery_enabled`. |

Chuẩn bị một tài khoản web đang hoạt động trong MySQL. Cách tạo mật khẩu cho tài khoản mẫu trên database thử có trong [hướng dẫn JWT và tài khoản](../docs/RUN_BACKEND_WINDOWS.md#5-jwt-và-tài-khoản).

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --workers 1
```

Mỗi database chạy một backend worker. Sau khi server khởi động, kiểm tra [kết nối MySQL](http://127.0.0.1:8000/health/db) và [trạng thái MQTT](http://127.0.0.1:8000/api/health). Swagger ở [`/docs`](http://127.0.0.1:8000/docs).

## 3. Chạy frontend

Dùng Node.js 22.12 trở lên. Mở cửa sổ PowerShell thứ hai tại thư mục gốc.

```powershell
Set-Location frontend
npm.cmd ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Trong `frontend/.env.local`, đặt `VITE_API_BASE_URL=http://127.0.0.1:8000` nếu backend chạy theo lệnh ở trên. Trong thư mục `frontend`, chạy `npm.cmd run dev` và đăng nhập ở địa chỉ Vite in ra, thường là [localhost:5173](http://localhost:5173).

## 4. Kết nối node và kiểm tra dữ liệu

1. Tạo `firmware/node_full/config.h` từ [file cấu hình mẫu](../firmware/node_full/config.example.h) nếu chưa có. Điền Wi-Fi, thông tin broker và `DEVICE_ID` riêng cho từng bo. Với MQTT qua TLS, cấu hình CA theo [hướng dẫn MQTT Cloud](../docs/CLOUD_MQTT.md). Nạp firmware qua USB theo [README chính](../README.md#bắt-đầu).
2. Kiểm tra mã node và phòng trong hệ thống quản lý. Backend chỉ lưu telemetry khi node có cả trạng thái vòng đời và thông tin xác thực ở mức `active`. Tài khoản MQTT của node phải được cấp trên broker.
3. Xác nhận `database: connected` ở `/health/db` và `mqtt.connected: true` ở `/api/health`. Mở chi tiết node trên web, kiểm tra thời điểm nhận dữ liệu thay đổi và có bản ghi mới trong lịch sử. Nếu MQTT đã kết nối mà web chưa có dữ liệu, đối chiếu `DEVICE_ID`, topic, tài khoản MQTT và trạng thái node.

## 5. Triển khai qua HTTPS và FOTA

Khi đưa web ra ngoài máy, chạy `npm.cmd run build` trong `frontend/`. Phục vụ `frontend/dist/` qua HTTPS, trả `index.html` cho các đường dẫn của giao diện React và chuyển tiếp `/api/` đến backend trên cùng tên miền.

Nếu demo cập nhật firmware qua mạng (FOTA), cấu hình endpoint tải HTTPS, khóa công khai và hai tệp `.signed.bin`, `.manifest` theo [hướng dẫn FOTA](../docs/OTA_CONTRACT.md). Giữ `.env`, `settings.local.json`, `config.h`, mật khẩu và khóa riêng ký firmware ngoài Git.
