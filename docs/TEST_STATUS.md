# Bằng chứng kiểm tra và phần cần nghiệm thu

Đây là bản ghi **theo từng mốc**, không phải trạng thái thiết bị trực tiếp. Các kết quả dưới đây thuộc bản bàn giao firmware; không tính các kiểm tra backend/web vào kết quả do phần firmware cung cấp.

## Khôi phục tương thích backend và giữ cài Wi-Fi — 10/11/2026

- Source marker `NODE_FULL_V7_BACKEND_COMPATIBLE`, phiên bản `node-full-v7-backend-compatible`. Sketch dùng lại parser, bản ghi LittleFS và bộ điều khiển thử đầu ra hiện có; bỏ phụ thuộc header `remote_config_json.h` bị thiếu và tạo topic telemetry theo ID.
- Lệnh ngưỡng dùng `request_id`, `boot_id`, `expected_revision`, `expires_uptime_s`, `thresholds`. Chỉ áp dụng sau khi lưu/đọc kiểm tra thành công; ACK là `remote_config` trong telemetry. Lệnh thử đầu ra và metadata `buzzer_test.version=2` dùng đúng hợp đồng backend. Không dùng topic ACK/state riêng của bản RAM trước đó.
- 273 kiểm tra C++ native đạt: 76 ngưỡng/lưu trữ, 129 đầu ra/discovery, 31 hostname/đồng hồ và 37 kiểm tra tích hợp hàng đợi/lưu trữ/metadata/đầu ra mới. Kiểm tra discovery vẫn chỉ kiểm tra helper độc lập.
- Hai bài kiểm tra cầu nối với backend thật đạt: JSON do controller backend tạo được native firmware xử lý, ACK được backend xác nhận; gồm đổi ngưỡng/khởi động lại và thử còi start/completed/stop. Chỉ thay journal database và transport MQTT, không truy cập dịch vụ đang chạy. Cách chạy ở [tests/README](../tests/README.md#v7-devicebackend-contract-regression).
- Hàm `makePayload()` lấy từ chính sketch được chạy trong harness native với bốn trạng thái, gồm lúc thử đầu ra, đang chờ số đo sau đổi ngưỡng và giá trị ID/bộ đếm lớn nhất. Cả bốn JSON được validator backend chấp nhận.
- Bốn biến thể build đạt trên NodeMCU/core 3.1.2 với `ALARM_POLICY_SELF_TEST` và `--warnings all`: LAN có macro, LAN cấu hình cũ thiếu macro, TLS thiếu CA, TLS có CA fixture công khai. Build LAN cuối: RAM 36.888/80.192, IRAM 61.555/65.536, flash 338.976/1.048.576 byte. Build TLS có CA: RAM 37.420/80.192, IRAM 61.891/65.536, flash 447.480/1.048.576 byte.
- Phần provisioning Wi-Fi được đối chiếu giữ nguyên: FLASH/D3 hoặc Serial mở AP, kiểm tra Wi-Fi mới trước khi lưu EEPROM, ưu tiên mạng đã lưu sau khởi động lại. Đã thêm hướng dẫn [đổi Wi-Fi không nạp lại](../README.md#đổi-wi-fi-sau-khi-nạp-firmware).
- Chưa nạp lên ESP hoặc thử broker/TLS, đổi Wi-Fi, EEPROM/LittleFS và còi/LED trên phần cứng thật trong lần sửa này. CA và mật khẩu dùng khi build là fixture, không phải cấu hình hoạt động của thiết bị.

## Nguồn/build trước bổ sung cloud TLS

- Marker source: NODE_FULL_V6_DEVICE_TOPICS; ESP gửi namespace telemetry riêng theo ID và metadata thử còi/đèn version 2.
- Ghi nhận build ngày 04/11/2026 của source trước đóng gói: NodeMCU ESP8266 core 3.1.2, bật ALARM_POLICY_SELF_TEST, biên dịch đạt.
- Bộ nhớ ở đúng build đó: RAM 34.400/80.192 byte; IRAM 61.447/65.536 byte; flash 309.240/1.048.576 byte. Cấu hình mẫu/thư viện khác có thể làm số byte đổi.
- Biên dịch đạt không chứng minh bản build đó đã được nạp lên từng bo. Bản công khai không chứa binary đã nhúng cấu hình riêng.

## Kiểm tra native C++ đã ghi nhận

| Nhóm | Bằng chứng đã có |
| --- | --- |
| Ngưỡng/lưu trữ | Mốc 76 kiểm tra parser, chống lặp, bản ghi/checksum và khôi phục filesystem giả lập đạt. |
| Thử đầu ra/discovery | Mốc 129 kiểm tra native đạt sau khi gộp thử còi và LED: có chọn hai pha đỏ, lỗi/phục hồi trong lượt thử, hết giờ/stop, ưu tiên cảnh báo, parser/timer/discovery/HMAC/chống phát lại. |
| Hostname/đồng hồ cloud TLS | Mốc 31 kiểm tra native đạt cho hostname DNS hợp lệ/không hợp lệ, giới hạn label/độ dài và điều kiện thời gian sẵn sàng. Không thực hiện DNS hoặc TLS handshake thật. |

Đây là các nhóm/mốc được ghi riêng, không cộng với kiểm tra backend hoặc coi là số ca nghiệm thu vật lý. Cách chạy các tệp C++ được cung cấp ở [tests/README](../tests/README.md). Các ca native dùng môi trường mô phỏng, không tự điều khiển mạch thật.

## Kiểm tra bản đã loại cấu hình riêng — 04/11/2026

- Tám tệp source công khai trong thư mục firmware được đối chiếu giống source đang phát triển; config.example.h dùng placeholder, không kèm config.h hoặc khóa thật.
- Bản sao kiểm tra dùng cấu hình mẫu và không có discovery_key.h đã biên dịch đạt trên NodeMCU core 3.1.2 với ALARM_POLICY_SELF_TEST. RAM 34.252/80.192 byte, IRAM 61.447/65.536 byte, flash 309.032/1.048.576 byte. Chế độ này dùng IP broker dự phòng, discovery bị tắt.
- Chạy lại executable kiểm tra cho bản export: 129 ca đầu ra/discovery và 76 ca ngưỡng/lưu trữ đều đạt. Không chạy backend, broker hoặc đầu ra vật lý trong các kiểm tra này.
- Tám JSON mẫu được parse; ba telemetry đầy đủ được kiểm tra theo schema tham chiếu. Request ID của stop khác start; bộ đếm lệnh stop nối tiếp start. Các đoạn ACK được đánh dấu là trích đoạn, không phải telemetry độc lập.

## Bổ sung cloud MQTT TLS — 04/11/2026

- Mặc định giữ MQTT TCP/IPv4 LAN, hỗ trợ cả cấu hình cũ không khai báo `MQTT_USE_TLS`. Chế độ cloud bật riêng `MQTT_USE_TLS=1`, dùng hostname, CA và SNTP; signed LAN discovery bị tắt. Xem [CLOUD_MQTT](CLOUD_MQTT.md).
- Chạy lại ba executable native: 76 kiểm tra ngưỡng/lưu trữ, 129 kiểm tra đầu ra/discovery và 31 kiểm tra hostname/thời gian cloud đều đạt (236 kiểm tra native). Các kiểm tra này không kết nối broker hoặc điều khiển thiết bị.
- Bốn biến thể ESP8266/NodeMCU core 3.1.2 đã biên dịch đạt với `ALARM_POLICY_SELF_TEST`: LAN khai báo `MQTT_USE_TLS=0`; LAN cấu hình cũ thiếu macro; TLS có CA fixture công khai; TLS không có CA. Biến thể thiếu CA biên dịch được nhưng mã khởi tạo không bật kết nối cloud, không bỏ qua kiểm tra TLS.
- Build TLS có cấu hình kiểm tra cuối cùng: RAM 34.812/80.192 byte; IRAM 61.783/65.536 byte; flash 415.012/1.048.576 byte. Số liệu thuộc đúng build đó, dùng giá trị kết nối giả và CA fixture công khai; không phải bằng chứng đã cấu hình/nối broker cloud thật. RAM tĩnh khi biên dịch không phải heap còn lại lúc handshake.
- Trạng thái trên phản ánh thời điểm lập build record, trước lần tích hợp thật bên dưới; không còn là trạng thái mới nhất của broker/node02.
- DNS, TCP connect và TLS handshake chạy đồng bộ, có thể làm chậm lấy mẫu. Chưa đo độ trễ vòng xử lý, heap khi handshake/reconnect, hoặc kiểm tra trên thiết bị thật với CA sai, tên chứng chỉ sai, chứng chỉ hết hạn và mạng/NTP không sẵn sàng. Các ca native về hostname/thời gian và build thiếu CA không thay thế các thử nghiệm TLS thực tế này.
- Telemetry node02 qua Cloud và backend đã được kiểm tra thủ công bên dưới. Vẫn cần nghiệm thu riêng reconnect, hai node, lệnh ngưỡng và đầu ra vật lý.

## Kiểm tra thủ công end-to-end — 04/11/2026

- ESP `node02` / phòng `102` kết nối EMQX Cloud qua TLS và publish telemetry schema 6. EMQX Clients hiển thị `node02` và `iot-full-backend` cùng kết nối; MQTT Client `emqx_cloud...` là client thử trong giao diện EMQX.
- Backend FastAPI nhận topic `iot/devices/+/telemetry`. `/api/health` trả HTTP 200, `connected: true`, `rejected: 0`, và bộ đếm `accepted` tăng; `/api/devices` trả node02 online với telemetry mới.
- Dữ liệu được lưu trong SQLite cục bộ; trang `/` trả HTTP 200. Đây là kiểm tra local, backend chỉ bind `127.0.0.1:8000`; chưa triển khai public và chưa kiểm tra MySQL.
- Telemetry báo `buzzer_test.status=completed`; chưa có biên bản xác nhận âm thanh còi/LED thực tế. Payload còn `test: true`, API còn `prototype: true`.
- `node01` chỉ có bản ghi cũ trong database và được đánh dấu offline. Chưa nghiệm thu node01 online cùng lúc với node02.

## Ghi nhận thiết bị trước đó — khoảng 07:31, 04/11/2026, giờ Việt Nam

- Đã quan sát telemetry mới của node02, phòng 102, được bên nhận tiếp tục nhận; tại mốc đó node02 hiển thị online.
- node01 hiển thị offline trong cùng lần kiểm tra.
- Đây là ghi nhận lịch sử có thời điểm; không khẳng định thiết bị đang online khi người đọc mở repo.
- Chưa có biên bản riêng xác nhận hash/marker đang chạy trên cả hai bo, nhánh D1 của từng mạch, tiếng còi, màu/nhịp LED thực tế, mất nguồn cảm biến hoặc ngưỡng được lưu qua khởi động lại trên từng bo.

## Cần hoàn tất với Long

Lập biên bản theo từng ID cho telemetry/topic, mất mạng/phục hồi, đổi/lưu ngưỡng, thử/stop đầu ra, ưu tiên cảnh báo và lỗi cảm biến; xem [HANDOVER](HANDOVER.md). ACK và kết quả mô phỏng chỉ xác nhận phần mềm trong phạm vi đã kiểm tra, không thay việc nghe còi/nhìn LED hoặc kiểm tra dây/nguồn.

Các [JSON trong examples](../examples/README.md) là MÔ PHỎNG được kiểm tra theo schema hiện có; không phải log hoạt động, không phải dữ liệu nghiệm thu thật và không tự gửi tới thiết bị.
