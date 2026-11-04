# BTL_IOT — dự án giám sát và cảnh báo cháy/gas

Repository nhóm gồm firmware ESP8266 cho hai node, frontend và backend prototype FastAPI. Backend hiện nhận telemetry từ EMQX Cloud, lưu SQLite và cung cấp API/dashboard; Long tiếp tục chuyển lớp database sang MySQL, nối frontend và hoàn thiện triển khai.

Phần bàn giao **Nguyễn Văn An: phần cứng/firmware ESP8266, cảm biến, LED và còi cho hai node** gồm firmware, cấu hình mẫu, hợp đồng MQTT, JSON mô phỏng và kiểm tra firmware. Hà Hải Long tiếp tục từ backend/API prototype hiện có, chuyển SQLite sang MySQL và hoàn thiện tích hợp/deployment.

## Nội dung và điểm bàn giao

| Thư mục | Nội dung |
| --- | --- |
| `firmware/node_full/` | Firmware V6 hiện tại, cấu hình mẫu và ngưỡng/thử đầu ra/discovery |
| `tests/firmware/usb_stability_test/`, `tests/firmware/ds18b20_test/`, `tests/firmware/mq2_test/` | Sketch thử riêng giữ lại từ gói P1 |
| `hardware/` | Bảng chân, sơ đồ dây, danh sách linh kiện và nơi bổ sung ảnh prototype thật |
| `docs/` | Bàn giao, hợp đồng MQTT hiện tại, tình trạng kiểm tra và tài liệu P1 lịch sử |
| `examples/` | Telemetry/lệnh/ACK mô phỏng theo hợp đồng MQTT hiện tại |
| `tests/` | Kiểm tra native C++, hướng dẫn biên dịch và kịch bản kiểm tra phần cứng |
| `backend/` | FastAPI/Paho subscriber, validation, SQLite storage, API điều khiển và dashboard prototype |
| `database/` | Ghi chú schema SQLite hiện tại và điểm bắt đầu cho MySQL schema/migration |
| `frontend/` | Website giám sát; mặc định dùng dữ liệu giả lập |

```text
DS18B20 / MQ-2 / Flame → ESP8266 → đèn/còi tại chỗ
                              ↕ Wi-Fi / MQTT
                            backend → database / web / Telegram
```

Luồng ESP → EMQX → FastAPI → SQLite/API đã được kiểm tra thủ công với node02. Frontend React vẫn mặc định dùng dữ liệu giả lập; cần nối nó với API thật. Backend hiện là prototype, chưa chuyển MySQL hoặc triển khai công khai.

Tài liệu `docs/telemetry-contract.md` và `docs/progress.md` giữ lại mốc P1 ngày 26/10/2026. Khi tích hợp firmware hiện tại, dùng [MQTT_CONTRACT](docs/MQTT_CONTRACT.md), [JSON mẫu mới](examples/README.md) và [TEST_STATUS](docs/TEST_STATUS.md).

## Bắt đầu

1. Đọc [bàn giao cho Long](docs/HANDOVER.md), [sơ đồ dây](hardware/wiring.md), [sơ đồ chân hiện tại](docs/PINOUT.md) và [hợp đồng MQTT](docs/MQTT_CONTRACT.md). Ngắt mọi nguồn khi thay dây; nhánh D1 dành cho giám sát nguồn Flame 3V3.
2. Giữ toàn bộ thư mục `firmware/node_full` khi biên dịch. Tạo cấu hình riêng từ mẫu:

   ```powershell
   Copy-Item .\firmware\node_full\config.example.h .\firmware\node_full\config.h
   ```

3. Điền Wi-Fi 2,4 GHz, địa chỉ broker, cổng và tài khoản MQTT do Long cấp. Mặc định dùng IPv4 broker LAN; để dùng hostname/TLS cloud, làm theo [CLOUD_MQTT](docs/CLOUD_MQTT.md). `127.0.0.1` trên ESP là chính ESP, không phải máy tính.
4. Với bo phòng 101 dùng `DEVICE_ID="node01"`, `ROOM_ID="101"`; với bo phòng 102 dùng `node02`/`102`. ID phải riêng cho mỗi ESP; phòng đặt theo vị trí thật. Bản V5 trước đây từng dùng `node02`/phòng `101`; cần thống nhất ánh xạ với backend khi đổi và phân biệt dữ liệu lịch sử.
5. Nạp đúng bo/cổng COM bằng Arduino IDE. Serial 115200 của source hiện tại có marker `NODE_FULL_V6_DEVICE_TOPICS`. Ghi lại marker/ID trên từng bo; việc source biên dịch đạt không chứng minh nó đã được nạp.

## Chạy backend prototype

Trong `backend/`, tạo `settings.local.json` từ mẫu, đặt broker/TLS/CA và thông tin đăng nhập thật; không commit file local. Cài và chạy:

```powershell
cd backend
Copy-Item .\settings.example.json .\settings.local.json
py -m pip install -r requirements.txt
py -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Với EMQX Serverless, cấu hình cục bộ cần `mqtt_tls: true`, cổng `8883`, topic `iot/devices/+/telemetry`, đường dẫn CA hợp lệ và `discovery_enabled: false`. Kiểm tra `/api/health`, `/api/devices`, `/api/history?device_id=node02` và trang `/`. Xem [backend README](backend/README.md); SQLite là storage prototype, Long cần chuyển sang MySQL.

Firmware đọc `config.h`, không tự đọc `.env`. `config.h` là cấu hình riêng, đã được bỏ qua trong Git. Mẫu trong repo không chứa mật khẩu hoạt động. Mặc định `MQTT_USE_TLS=0` giữ MQTT TCP/IPv4 trong LAN, kể cả cấu hình cũ chưa khai báo macro này. Chế độ cloud phải bật riêng `MQTT_USE_TLS=1`, dùng hostname do nhà cung cấp cấp, cổng TLS (thường 8883), CA PEM trong `mqtt_ca.h` và đồng hồ SNTP sẵn sàng để kiểm tra chứng chỉ. Chế độ TLS không tự hạ xuống TCP thường khi cấu hình hoặc xác thực thất bại; xem [hướng dẫn cloud](docs/CLOUD_MQTT.md).

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

Không có `discovery_key.h` thì firmware vẫn biên dịch và dùng `MQTT_HOST` dự phòng. Backend có responder UDP/HMAC tùy chọn trong `backend/discovery.py`; chỉ bật khi chạy LAN và đã cấu hình khóa riêng. Khóa thật được trao đổi riêng, không commit vào Git. Đổi khóa hoặc Wi-Fi trong source cần nạp lại ESP tương ứng.

Discovery chỉ áp dụng cho chế độ LAN/subnet và dải IP riêng mà firmware cho phép. `MQTT_USE_TLS=1` tắt signed LAN discovery và dùng trực tiếp hostname cloud đã cấu hình. Nếu chạy LAN mà chưa triển khai responder, dùng IPv4 broker cố định được truy cập từ ESP.

## Kiểm tra và nghiệm thu

- [Hướng dẫn chạy kiểm tra firmware](tests/README.md).
- [Kết quả phần mềm và tình trạng nghiệm thu từng node](docs/TEST_STATUS.md).

Cảm biến và cảnh báo tại ESP tiếp tục được xử lý nếu mất mạng nhưng còn nguồn. MQ-2 chờ phần mềm 300 giây sau mỗi lần ESP khởi động; ADC thô không phải ppm và không chẩn đoán được mọi lỗi dây/nguồn.

DNS, TCP connect và TLS handshake hiện chạy đồng bộ, có thể làm chậm vòng lấy mẫu khi thử nối cloud. Chưa có nghiệm thu độ trễ thực tế, heap khi handshake/reconnect hoặc từ chối chứng chỉ trên broker/ESP thật; các build và native checks trong [TEST_STATUS](docs/TEST_STATUS.md) là bằng chứng phần mềm.

Không đưa `config.h`, `mqtt_ca.h` cục bộ, `settings.local.json`, khóa discovery, mật khẩu, database, log vận hành hoặc binary/build đã nhúng cấu hình riêng vào repo. CA nhà cung cấp là chứng chỉ công khai nhưng file cục bộ vẫn được giữ ngoài repo theo cấu hình nhóm. Backend prototype có trong repo; chưa bao gồm database vận hành, thông tin truy cập hay cấu hình production.

## Phần cứng và nghiệm thu từng node

Thực hiện [kịch bản kiểm tra phần cứng](tests/hardware-test-cases.md) cho từng board. Các sketch thử riêng và bằng chứng P1 cũ vẫn được giữ trong [tests/README](tests/README.md). Số đo hoặc trạng thái online của một node không xác nhận cả hai node đã chạy đầy đủ; ACK/biên dịch đạt không thay quan sát còi, LED, dây, nguồn và ngưỡng lưu trên từng board.

Còi nghỉ HIGH, nguồn MQ tại VV và Flame 3V3 cần đối chiếu module/mạch thật theo tài liệu phần cứng. Nếu compiler ESP8266 báo lỗi Unicode do đường dẫn tiếng Việt, dùng đường dẫn ASCII, ví dụ `C:\iot_p1\`; thay đường dẫn không sửa được lỗi nguồn hoặc USB quá dòng.

## Cách ghép việc trong nhóm

| Thành viên tiếp nhận | Cần đọc / cần thống nhất |
| --- | --- |
| Backend (Long) | Đọc `backend/README.md`, hợp đồng MQTT và JSON mẫu; chuyển SQLite sang MySQL, giữ API/topic/schema, hoàn thiện triển khai và nghiệm thu lệnh/ACK |
| Frontend | Trạng thái `normal/fault/alarm`, health từng cảm biến, °C/ADC, thời gian nhận cuối; hợp đồng HTTP API và dữ liệu giả có ghi mô phỏng |
| Triển khai / bot | Cấu hình broker và truy cập, thông báo chống gửi lặp; bot là phần nâng cao, không thay web quản lý |
| P1 | Hoàn thiện dây và nghiệm thu từng node; bổ sung ảnh thật, kết quả và log đã loại thông tin cá nhân |

Mỗi người commit bằng tài khoản GitHub của mình, mô tả đúng thay đổi thật. Không tạo lịch sử commit giả. Nhóm tạo tag/release cuối sau khi tích hợp và nghiệm thu; bản bàn giao chưa phải xác nhận đạt v1.0.0.

Không commit `.env` thật, token bot, mật khẩu broker, log chứa dữ liệu cá nhân, `.venv`, cache hay `.bak`. `.gitignore` chỉ giúp bỏ qua file chưa được theo dõi; kiểm tra danh sách file trước khi commit. Không đưa mật khẩu/token vào nội dung commit hoặc ảnh chụp.

## Chạy frontend

Xem [frontend/README.md](frontend/README.md). Tóm tắt:

```powershell
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Mở http://localhost:5173. Mặc định chạy với dữ liệu giả lập (ghi rõ là mô phỏng), không cần backend.
