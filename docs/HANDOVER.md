# Bàn giao firmware cho Hà Hải Long

Phạm vi bản bàn giao này là phần **phần cứng/firmware ESP của Nguyễn Văn An**. Nó cung cấp chương trình hai node, cấu hình mẫu, hợp đồng MQTT, dữ liệu mô phỏng và kiểm tra C++ của firmware. Phần giao diện web của nhóm nằm riêng trong `frontend/`; backend, database, tài khoản vận hành và dịch vụ cloud không thuộc bản bàn giao firmware này.

## Long nhận những gì

1. [README](../README.md) và toàn bộ thư mục firmware/node_full; bắt đầu từ [config.example.h](../firmware/node_full/config.example.h), tạo config.h riêng tại máy.
2. [PINOUT](PINOUT.md): chân, điện trở, mặc định và giới hạn chẩn đoán phần cứng đang có.
3. [MQTT_CONTRACT](MQTT_CONTRACT.md): ba topic, JSON, kiểu/null, đơn vị, ACK, heartbeat/reconnect và discovery tùy chọn.
4. [examples](../examples/README.md): telemetry normal/fault/thử đầu ra, lệnh ngưỡng/start/stop và đoạn ACK. Tất cả là mô phỏng, không phải số đo thật.
5. [TEST_STATUS](TEST_STATUS.md) và [hướng dẫn kiểm tra firmware](../tests/README.md): bằng chứng phần mềm và các mục chưa nghiệm thu trên từng bo.

Node dự kiến khi lắp hai phòng: node01/101 và node02/102. Mỗi lần nạp phải giữ ID riêng. Không kết luận cả hai node đã online chỉ từ việc một node có dữ liệu.

## Phần Long triển khai

- Cấu hình broker có xác thực, cấp tài khoản riêng phù hợp; cho ESP dùng IPv4/cổng đã thống nhất. Thông tin truy cập thật trao đổi riêng, không đưa vào repo.
- Nhận iot/devices/+/telemetry; kiểm tra topic cụ thể, ID trùng payload, kiểu dữ liệu và phiên bản. Loại bản retained/sai định dạng; không tạo số đo hợp lệ từ null.
- Thiết kế database, lưu received_at UTC và payload; chống trùng (device_id, boot_id, seq); xử lý online/offline và chính sách bản đến muộn/lưu lịch sử. Đây là phần Long xây dựng, không có mã database đi kèm.
- Gửi lệnh ngưỡng/thử đầu ra đúng topic; theo dõi request ID, boot, revision/command_seq và ACK từ telemetry. Không coi publish thành công là ESP đã áp dụng hoặc còi vật lý đã kêu.
- Nếu cần tự tìm broker: triển khai responder UDP/HMAC trong hợp đồng. Nếu chưa làm, dùng IPv4 dự phòng cố định và cấu hình riêng; không có server discovery trong repo này.
- Xây HTTP API cho web theo giao diện mà Long và người làm web thống nhất. HTTP API không phải yêu cầu để ESP chạy MQTT và không được cung cấp trong bản firmware này.

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

Repo công khai chỉ chứa cấu hình mẫu. config.h, discovery_key.h, mật khẩu, khóa thật, database vận hành và binary nhúng cấu hình riêng không thuộc gói công khai. Long tự tạo cấu hình cục bộ; không dựa vào đường dẫn máy cá nhân của người bàn giao.

Firmware hiện dùng MQTT TCP LAN; chưa có TLS cho broker cloud. Nếu phát triển truy cập Internet, Long/người 3 cần thống nhất TLS/HTTPS, phân quyền lệnh và lưu dữ liệu bền vững trước khi mở công khai. Tài liệu này không khẳng định có backend hoặc dịch vụ public đã được xây dựng/triển khai.
