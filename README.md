# BTL_IOT — dự án giám sát và cảnh báo cháy/gas

Repository nhóm gồm firmware ESP8266 cho hai node, backend FastAPI dùng MySQL và frontend React. Backend đã nhận telemetry thật qua EMQX Cloud và lưu MySQL trong buổi kiểm thử local. Frontend vẫn mặc định dùng dữ liệu mô phỏng; đăng nhập thật, quản trị tài khoản MQTT tự động và triển khai chung chưa hoàn tất tích hợp.

Phần **Nguyễn Văn An** gồm phần cứng/firmware ESP8266, cảm biến, LED, còi và hợp đồng MQTT. **Hà Hải Long** phụ trách MQTT, MySQL, API dữ liệu/điều khiển và vòng đời node. **Đăng Kỳ Vĩ** phụ trách dịch vụ tài khoản/xác thực, phối hợp sự cố và thông báo. **Vũ Thành Nguyên** tích hợp giao diện với API. Xem [bàn giao hiện tại](docs/HANDOVER.md) và [phần đã kiểm thử/còn thiếu](docs/LONG_IMPLEMENTATION_STATUS.md).

## Nội dung và điểm bàn giao

| Thư mục | Nội dung |
| --- | --- |
| `firmware/node_full/` | Firmware V7, telemetry schema 6, cài Wi-Fi và chỉnh ngưỡng/thử đầu ra |
| `tests/firmware/usb_stability_test/`, `tests/firmware/ds18b20_test/`, `tests/firmware/mq2_test/` | Sketch thử riêng giữ lại từ gói P1 |
| `hardware/` | Bảng chân, sơ đồ dây, danh sách linh kiện và nơi bổ sung ảnh prototype thật |
| `docs/` | Bàn giao, hợp đồng MQTT hiện tại, tình trạng kiểm tra và tài liệu P1 lịch sử |
| `examples/` | Telemetry/lệnh/ACK mô phỏng theo hợp đồng MQTT hiện tại |
| `tests/` | Kiểm tra native C++, hướng dẫn biên dịch và kịch bản kiểm tra phần cứng |
| `backend/` | FastAPI/Paho, validation, MySQL, JWT adapter, API quản lý/điều khiển và dashboard thử API |
| `database/` | Schema MySQL chuẩn, migration, dữ liệu demo/test tùy chọn |
| `frontend/` | Website giám sát; mặc định dùng dữ liệu giả lập |

```text
DS18B20 / MQ-2 / Flame → ESP8266 → đèn/còi tại chỗ
                              ↕ Wi-Fi / MQTT
                            backend → database / web / Telegram
```

Luồng ESP node01/node02 → EMQX → FastAPI → MySQL đã được quan sát trong buổi test local. Trạng thái này không xác nhận đầy đủ đầu ra còi/LED, phân quyền topic trên broker hoặc hệ thống đã được triển khai công khai. Không dùng số đo mới trong SQL để kết luận tài khoản MQTT đã được BE cấp/thu hồi thành công.

Tài liệu `docs/telemetry-contract.md` và `docs/progress.md` giữ lại mốc P1 ngày 26/10/2026. Khi tích hợp firmware hiện tại, dùng [MQTT_CONTRACT](docs/MQTT_CONTRACT.md), [JSON mẫu mới](examples/README.md) và [TEST_STATUS](docs/TEST_STATUS.md).

## Bắt đầu

1. Đọc [bàn giao nhóm](docs/HANDOVER.md), [sơ đồ dây](hardware/wiring.md), [sơ đồ chân hiện tại](docs/PINOUT.md) và [hợp đồng MQTT](docs/MQTT_CONTRACT.md). Ngắt mọi nguồn khi thay dây; nhánh D1 dành cho giám sát nguồn Flame 3V3.
2. Giữ toàn bộ thư mục `firmware/node_full` khi biên dịch. Tạo cấu hình riêng từ mẫu:

   ```powershell
   Copy-Item .\firmware\node_full\config.example.h .\firmware\node_full\config.h
   ```

3. Điền Wi-Fi 2,4 GHz, địa chỉ broker, cổng và tài khoản MQTT riêng đã được cấu hình cho node. Đối chiếu username với registry BE; việc đăng ký node chưa tự tạo tài khoản trên EMQX. Để dùng hostname/TLS cloud, làm theo [CLOUD_MQTT](docs/CLOUD_MQTT.md). `127.0.0.1` trên ESP là chính ESP, không phải máy tính.
4. Với bo phòng 101 dùng `DEVICE_ID="node01"`, `ROOM_ID="101"`; với bo phòng 102 dùng `node02`/`102`. ID phải riêng cho mỗi ESP; phòng đặt theo vị trí thật. Bản V5 trước đây từng dùng `node02`/phòng `101`; cần thống nhất ánh xạ với backend khi đổi và phân biệt dữ liệu lịch sử.
5. Nạp đúng bo/cổng COM bằng Arduino IDE. Serial 115200 của source hiện tại có marker `NODE_FULL_V7_BACKEND_COMPATIBLE`. Ghi lại marker/ID trên từng bo; việc source biên dịch đạt không chứng minh nó đã được nạp.

## Đổi Wi-Fi sau khi nạp firmware

Không cần sửa `config.h` hoặc nạp lại ESP mỗi khi đổi Wi-Fi:

1. Khi ESP đang chạy, giữ nút **FLASH/D3 trong 3 giây**, rồi thả. Có thể gửi `wifi` + Enter qua Serial 115200 để mở cùng chế độ này. Nếu chưa có Wi-Fi hợp lệ, ESP cũng tự mở trang cài đặt.
2. Dùng điện thoại/máy tính kết nối mạng `IOT-Setup-…`. Mật khẩu cài đặt riêng của từng ESP được in trong Serial khi mở chế độ này; ghi lại một lần để dùng về sau. Đây là mật khẩu mạng cài đặt, khác mật khẩu router và MQTT.
3. Mở **http://192.168.4.1**, nhập SSID và mật khẩu Wi-Fi **2,4 GHz**, rồi bấm **Kết nối và lưu**.
4. ESP chỉ lưu vào EEPROM sau khi nhận được IP từ Wi-Fi mới. Khi thành công, mạng cài đặt đóng sau khoảng 15 giây; nếu kết nối thất bại sau khoảng 20 giây, cấu hình đã lưu trước đó vẫn được giữ.

Wi-Fi đã lưu được dùng lại sau mất điện và được ưu tiên hơn Wi-Fi mặc định trong `config.h`. Đổi Wi-Fi giữ nguyên ID thiết bị, phòng, tài khoản broker và ngưỡng đã lưu. Với broker cloud, Wi-Fi mới cần truy cập Internet; với broker LAN, địa chỉ broker phải truy cập được từ mạng mới. Trang cài đặt chỉ mở trong cửa sổ 5 phút và có thể mở lại bằng FLASH/D3.

## Chạy backend MySQL

Làm theo [hướng dẫn backend từ đầu](backend/README.md): tạo môi trường Python, cấu hình MQTT/MySQL, khởi tạo DB hoặc migration, đặt JWT_SECRET rồi mới chạy server. Các lệnh sau dùng **CMD trên Windows**, chạy từ gốc repository sau khi hoàn thành cấu hình:

```bat
set "JWT_SECRET=<khoa-dung-chung-voi-dich-vu-tai-khoan-it-nhat-32-ky-tu>"
.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --workers 1
```

Thay placeholder JWT_SECRET bằng khóa riêng thực tế; file `.env` không được tự nạp. Mỗi DB chỉ chạy một backend/worker. `/api/health` công khai; `/api/devices`, lịch sử và thao tác quản lý cần Bearer JWT của user active trong SQL. Swagger ở http://127.0.0.1:8000/docs; `/` là trang thử API.

Với EMQX Serverless, điền `mqtt_tls: true`, cổng `8883`, topic `iot/devices/+/telemetry`, file CA hợp lệ và `discovery_enabled: false`. Kết nối MQTT nhận dữ liệu hoạt động riêng với API quản trị broker. Cấu hình hiện tại chưa hỗ trợ tự động cấp/xóa tài khoản MQTT trên Serverless; xem [giới hạn và mã lỗi](docs/LONG_API.md). Test khóa/mở và bảo trì tại BE theo [BE_LIFECYCLE_TEST](docs/BE_LIFECYCLE_TEST.md).

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
| Backend (Long) | MySQL/API đã có; hoàn tất cấu hình quản trị EMQX, tích hợp xác thực/frontend, deployment và nghiệm thu lệnh/ACK |
| Tài khoản (Vĩ) | API đăng ký/đăng nhập, băm mật khẩu, JWT; thống nhất users/role/status và phạm vi phòng với Long |
| Frontend (Nguyên) | Đối chiếu LONG_API với hợp đồng mock, tích hợp token và các response thực tế; tắt mock sau khi đã nối API |
| Triển khai / bot | Thống nhất dịch vụ, broker và HTTPS; thông báo chống gửi lặp là phần cần tích hợp riêng |
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
