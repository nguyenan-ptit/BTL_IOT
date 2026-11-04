# Bàn giao cho Hà Hải Long: MQTT, backend, API và database

Repo hiện có firmware hai node, hợp đồng MQTT và một **backend prototype FastAPI** đã kết nối EMQX Cloud, nhận telemetry, kiểm tra payload, lưu SQLite và phục vụ API/dashboard. Đây là nền tảng để Long tiếp tục; chưa phải backend MySQL đã triển khai production.

## Long nhận những gì

1. [README](../README.md), firmware mẫu và [CLOUD_MQTT](CLOUD_MQTT.md). Cấu hình ESP thật nằm cục bộ: tạo `config.h` từ [config.example.h](../firmware/node_full/config.example.h); CA ESP ở `mqtt_ca.h`.
2. [MQTT_CONTRACT](MQTT_CONTRACT.md): topic, schema, kiểu/null, đơn vị, ACK, heartbeat/reconnect và discovery.
3. `backend/`: FastAPI/Paho subscriber, validation schema 6, SQLite storage, API, điều khiển ngưỡng/thử còi và dashboard prototype. Xem [hướng dẫn backend](../backend/README.md).
4. `database/`: ghi chú schema hiện tại và phần cần tạo khi chuyển MySQL. Database SQLite vận hành không nằm trong repo.
5. [examples](../examples/README.md) là JSON mô phỏng; [TEST_STATUS](TEST_STATUS.md) ghi riêng bằng chứng phần mềm và kiểm tra thật.

Thông tin Cloud và `settings.local.json` không nằm trong Git. Long nhận broker host, tài khoản mới và CA qua kênh riêng. Node đã quan sát gửi thật: `node02` / phòng `102`; `node01` hiện chỉ có bản ghi lịch sử offline, chưa xác nhận online trong lượt kiểm tra này.

## Đã triển khai và kiểm tra thủ công

- ESP `node02` kết nối EMQX bằng MQTT TLS và publish `iot/devices/node02/telemetry`.
- Backend client `iot-full-backend` kết nối broker, subscribe `iot/devices/+/telemetry`; `/api/health` báo connected, accepted tăng và rejected bằng 0.
- Telemetry được lưu SQLite; `/api/devices` trả node02 online với dữ liệu mới. `/` phục vụ dashboard prototype. Payload đã báo lượt thử còi completed, nhưng cần xác nhận âm thanh/LED trên mạch riêng.

## Long tiếp tục

- Chuyển `backend/storage.py` từ SQLite sang MySQL; thêm schema/migration trong `database/`, cấu hình kết nối bằng biến môi trường hoặc secret runtime. Giữ API và hợp đồng MQTT ổn định.
- Giữ chống trùng theo `(device_id, boot_id, seq)`, `received_at` UTC, lịch sử và quy tắc online/offline 20 giây. Không nhập file `iot_data.db` làm database production.
- Chạy lại luồng MQTT TLS → MySQL → API; kiểm tra restart, dữ liệu trùng, mất kết nối và khôi phục. Cấu hình triển khai backend để website/người khác truy cập; hiện bản thử chạy local trên `127.0.0.1:8000`.
- Nghiệm thu cập nhật ngưỡng qua API/web và xác nhận còi/LED thực tế từng node. Phối hợp với Vũ Thành Nguyên để nối `frontend/` với API; trang `backend/index.html` là dashboard prototype riêng.
- Giữ `test: true`/`prototype: true` đến khi nhóm thống nhất chuyển sang dữ liệu vận hành. Tài khoản broker, mật khẩu MySQL, `settings.local.json`, CA riêng và database không commit.

Phần xác thực/phân quyền, sự cố và thông báo phối hợp với Đăng Kỳ Vĩ. Phần web, sử dụng API và kiểm thử liên thông phối hợp với Vũ Thành Nguyên. Lượt thử còi/đèn có thể đỏ/còi bật nhưng system_state vẫn normal/fault; đừng tạo sự cố cháy chỉ từ màu LED hoặc buzzer_cmd.

## Nghiệm thu chung trước khi tích hợp

| Ca | Cần ghi lại theo từng node |
| --- | --- |
| Nhận dạng/telemetry | ID, phòng, marker Serial, thời gian, topic và bản tin mới thực tế. |
| Mất mạng/phục hồi | Quá hạn offline phía nhận, ESP nối lại/đăng ký lại và có telemetry mới. |
| Ngưỡng | ACK đúng request/revision/giá trị; khởi động lại còn ngưỡng đã lưu. |
| Thử đầu ra | Còi và LED đỏ nhấp nháy khoảng 3 giây; stop/hết giờ trở về cảm biến; ghi quan sát vật lý riêng. |
| Ưu tiên cảnh báo | Cảnh báo thật được giữ khi dừng thử hoặc một cảm biến bị lỗi; không dùng lửa/rò khí thật để thử phần mềm. |
| Lỗi cảm biến | Đối chiếu null/health và sơ đồ; MQ-2 hiện chưa chẩn đoán đầy đủ mất nguồn/đứt AO. |

Chỉ đưa dữ liệu mô phỏng vào broker/database thử riêng của Long. Bản tin được ESP xác nhận vẫn cần phân biệt với nghiệm thu âm thanh, đèn, dây và nguồn trên mạch thật.

## Công khai và bảo mật

Repo công khai chỉ chứa cấu hình mẫu. config.h, mqtt_ca.h cục bộ, discovery_key.h, mật khẩu, khóa thật, database vận hành và binary nhúng cấu hình riêng không thuộc gói công khai. CA nhà cung cấp là chứng chỉ công khai, không phải private key. Long tự tạo cấu hình cục bộ; không dựa vào đường dẫn máy cá nhân của người bàn giao.

Firmware mặc định giữ MQTT TCP/IPv4 trong LAN và hỗ trợ cloud TLS 1.2 bằng lựa chọn `MQTT_USE_TLS=1`. Chế độ cloud kiểm tra hostname/chứng chỉ theo CA và thời gian SNTP, không tự chuyển sang TCP thường khi thất bại; signed discovery chỉ dành cho LAN. Long/người 3 tiếp tục thống nhất phân quyền lệnh, HTTPS/API và lưu dữ liệu bền vững; xem [CLOUD_MQTT](CLOUD_MQTT.md).

Các bộ kiểm tra native và build TLS đã đạt không xác nhận broker cloud đã được tạo, ESP đã kết nối hoặc hai node đã nghiệm thu. DNS/TCP/TLS handshake đồng bộ có thể làm chậm lấy mẫu; cần đo độ trễ, heap và kiểm tra lỗi chứng chỉ trên dịch vụ/thiết bị thật. Trạng thái hiện tại và giới hạn bằng chứng nằm trong [TEST_STATUS](TEST_STATUS.md).
