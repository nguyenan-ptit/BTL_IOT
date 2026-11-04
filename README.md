# BTL IoT — firmware hai node báo cháy

Phần bàn giao của **Nguyễn Văn An: phần cứng/firmware ESP8266, cảm biến, LED và còi cho hai node**. Repo cung cấp firmware, cấu hình mẫu, hợp đồng MQTT, JSON mô phỏng và kiểm tra firmware. Hà Hải Long triển khai MQTT receiver, database, HTTP API và quản lý vòng đời thiết bị dựa trên hợp đồng đó.

## Bắt đầu

1. Đọc [bàn giao cho Long](docs/HANDOVER.md), [sơ đồ chân](docs/PINOUT.md) và [hợp đồng MQTT](docs/MQTT_CONTRACT.md).
2. Giữ toàn bộ thư mục `firmware/node_full` khi biên dịch. Tạo cấu hình riêng từ mẫu:

   ```powershell
   Copy-Item .\firmware\node_full\config.example.h .\firmware\node_full\config.h
   ```

3. Điền Wi-Fi 2,4 GHz, IPv4 của máy chạy broker, cổng và tài khoản MQTT do Long cấp. `127.0.0.1` trên ESP là chính ESP, không phải máy tính.
4. Với bo phòng 101 dùng `DEVICE_ID="node01"`, `ROOM_ID="101"`; với bo phòng 102 dùng `node02`/`102`. ID phải riêng cho mỗi ESP; phòng đặt theo vị trí thật.
5. Nạp đúng bo/cổng COM bằng Arduino IDE. Serial 115200 của source hiện tại có marker `NODE_FULL_V6_DEVICE_TOPICS`. Ghi lại marker/ID trên từng bo; việc source biên dịch đạt không chứng minh nó đã được nạp.

`config.h` là cấu hình riêng, đã được bỏ qua trong Git. Mẫu trong repo không chứa mật khẩu hoạt động. `MQTT_HOST` hiện nhận IPv4; firmware này dùng MQTT TCP trong LAN, chưa hỗ trợ hostname/TLS cho broker cloud.

## Board và thư viện

| Thành phần | Phiên bản đã dùng để kiểm tra |
| --- | --- |
| Board | NodeMCU 1.0 (ESP-12E Module), ESP8266 core 3.1.2 |
| MQTT | MQTT 2.5.3 của Joel Gaehwiler / 256dpi |
| ArduinoJson | 6.21.5 |
| DallasTemperature | 4.0.6 |
| OneWire | 2.3.8 |

Giữ phân vùng LittleFS khi dùng Upload sketch thông thường để không xóa ngưỡng đã lưu. Các ngưỡng trong `config.h` là mặc định khi chưa có bản lưu hợp lệ; ngưỡng thực tế cần đọc từ telemetry.

## Giao tiếp với phần Long

| Topic | Chiều | QoS |
| --- | --- | --- |
| `iot/devices/<id>/telemetry` | ESP → bên nhận | 0 |
| `iot/devices/<id>/config/set` | Bên điều khiển → ESP | 1 |
| `iot/devices/<id>/buzzer/test` | Bên điều khiển → ESP | 1 |

Các publish không retained. Telemetry schema 6 gửi khoảng 2 giây/lần và khi trạng thái đổi; nó chứa dữ liệu, heartbeat và xác nhận lệnh. `buzzer_test.version=2` hỗ trợ thử chung còi và LED đỏ khoảng 3 giây. Các [JSON mẫu](examples/README.md) là mô phỏng, không phải dữ liệu thật hay lệnh đã gửi.

## Discovery tùy chọn

Không có `discovery_key.h` thì firmware vẫn biên dịch và dùng `MQTT_HOST` dự phòng. Để dùng tự tìm broker, Long cần triển khai responder UDP/HMAC theo [hợp đồng](docs/MQTT_CONTRACT.md) và thống nhất cùng khóa với ESP. Khóa thật được trao đổi riêng, không commit vào Git. Đổi khóa hoặc Wi-Fi trong source cần nạp lại ESP tương ứng.

Discovery chỉ áp dụng cho LAN/subnet và dải IP riêng mà firmware cho phép; không thay thế kết nối broker cloud. Nếu chưa triển khai responder, dùng IPv4 broker cố định được truy cập từ ESP.

## Kiểm tra và nghiệm thu

- [Hướng dẫn chạy kiểm tra firmware](tests/README.md).
- [Kết quả phần mềm và tình trạng nghiệm thu từng node](docs/TEST_STATUS.md).

Cảm biến và cảnh báo tại ESP tiếp tục được xử lý nếu mất mạng nhưng còn nguồn. MQ-2 chờ phần mềm 300 giây sau mỗi lần ESP khởi động; ADC thô không phải ppm và không chẩn đoán được mọi lỗi dây/nguồn.

Không đưa `config.h`, khóa discovery, mật khẩu, database, log vận hành hoặc binary/build đã nhúng cấu hình riêng vào repo. Repo này không kèm backend, web, database, tài khoản MQTT hay dịch vụ cloud đang vận hành; các phần đó do thành viên phụ trách tiếp tục xây dựng/tích hợp.
