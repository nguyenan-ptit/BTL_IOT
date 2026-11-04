# Bằng chứng kiểm tra và phần cần nghiệm thu

Đây là bản ghi **theo từng mốc**, không phải trạng thái thiết bị trực tiếp. Repo chỉ bàn giao firmware; không tính các kiểm tra backend/web vào kết quả do phần firmware cung cấp.

## Nguồn/build hiện tại

- Marker source: NODE_FULL_V6_DEVICE_TOPICS; ESP gửi namespace telemetry riêng theo ID và metadata thử còi/đèn version 2.
- Ghi nhận build ngày 04/11/2026 của source trước đóng gói: NodeMCU ESP8266 core 3.1.2, bật ALARM_POLICY_SELF_TEST, biên dịch đạt.
- Bộ nhớ ở đúng build đó: RAM 34.400/80.192 byte; IRAM 61.447/65.536 byte; flash 309.240/1.048.576 byte. Cấu hình mẫu/thư viện khác có thể làm số byte đổi.
- Biên dịch đạt không chứng minh bản build đó đã được nạp lên từng bo. Bản công khai không chứa binary đã nhúng cấu hình riêng.

## Kiểm tra native C++ đã ghi nhận

| Nhóm | Bằng chứng đã có |
| --- | --- |
| Ngưỡng/lưu trữ | Mốc 76 kiểm tra parser, chống lặp, bản ghi/checksum và khôi phục filesystem giả lập đạt. |
| Thử đầu ra/discovery | Mốc 129 kiểm tra native đạt sau khi gộp thử còi và LED: có chọn hai pha đỏ, lỗi/phục hồi trong lượt thử, hết giờ/stop, ưu tiên cảnh báo, parser/timer/discovery/HMAC/chống phát lại. |

Đây là các nhóm/mốc được ghi riêng, không cộng với kiểm tra backend hoặc coi là số ca nghiệm thu vật lý. Cách chạy các tệp C++ được cung cấp ở [tests/README](../tests/README.md). Các ca native dùng môi trường mô phỏng, không tự điều khiển mạch thật.

## Kiểm tra bản đã loại cấu hình riêng — 04/11/2026

- Tám tệp source công khai trong thư mục firmware được đối chiếu giống source đang phát triển; config.example.h dùng placeholder, không kèm config.h hoặc khóa thật.
- Bản sao kiểm tra dùng cấu hình mẫu và không có discovery_key.h đã biên dịch đạt trên NodeMCU core 3.1.2 với ALARM_POLICY_SELF_TEST. RAM 34.252/80.192 byte, IRAM 61.447/65.536 byte, flash 309.032/1.048.576 byte. Chế độ này dùng IP broker dự phòng, discovery bị tắt.
- Chạy lại executable kiểm tra cho bản export: 129 ca đầu ra/discovery và 76 ca ngưỡng/lưu trữ đều đạt. Không chạy backend, broker hoặc đầu ra vật lý trong các kiểm tra này.
- Tám JSON mẫu được parse; ba telemetry đầy đủ được kiểm tra theo schema tham chiếu. Request ID của stop khác start; bộ đếm lệnh stop nối tiếp start. Các đoạn ACK được đánh dấu là trích đoạn, không phải telemetry độc lập.

## Ghi nhận thiết bị thật — khoảng 07:31, 04/11/2026, giờ Việt Nam

- Đã quan sát telemetry mới của node02, phòng 102, được bên nhận tiếp tục nhận; tại mốc đó node02 hiển thị online.
- node01 hiển thị offline trong cùng lần kiểm tra.
- Đây là ghi nhận lịch sử có thời điểm; không khẳng định thiết bị đang online khi người đọc mở repo.
- Chưa có biên bản riêng xác nhận hash/marker đang chạy trên cả hai bo, nhánh D1 của từng mạch, tiếng còi, màu/nhịp LED thực tế, mất nguồn cảm biến hoặc ngưỡng được lưu qua khởi động lại trên từng bo.

## Cần hoàn tất với Long

Lập biên bản theo từng ID cho telemetry/topic, mất mạng/phục hồi, đổi/lưu ngưỡng, thử/stop đầu ra, ưu tiên cảnh báo và lỗi cảm biến; xem [HANDOVER](HANDOVER.md). ACK và kết quả mô phỏng chỉ xác nhận phần mềm trong phạm vi đã kiểm tra, không thay việc nghe còi/nhìn LED hoặc kiểm tra dây/nguồn.

Các [JSON trong examples](../examples/README.md) là MÔ PHỎNG được kiểm tra theo schema hiện có; không phải log hoạt động, không phải dữ liệu nghiệm thu thật và không tự gửi tới thiết bị.
