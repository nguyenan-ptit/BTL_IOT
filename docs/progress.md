# Tiến độ và việc còn chờ của P1

Cập nhật bàn giao 26/10/2026. Tài liệu ghi kết quả đã có, không suy ra trạng thái online hiện tại của ESP từ dữ liệu cũ.

| Hạng mục | Đã có | Chưa xác nhận / việc tiếp theo |
|---|---|---|
| Firmware V6 | Code đọc 3 cảm biến, RGB/còi, MQTT schema6; đã biên dịch với 31 kiểm tra tại thời điểm biên dịch | Chưa xác nhận nạp V6 lên board |
| Nguồn Flame/D1 | Thiết kế3V3→4,7k→D1; D1→47k→GND; người dùng có dư 2 điện trở và đã tháo MQ DO khỏi D1 | Chưa xác nhận nhánh mới được đấu; không nạp/kiểm tra mạch đầy đủ như đã hoàn thành |
| Module Flame | Người dùng xác nhận VCC hiện lấy 3V3 | Model nơi bán từng ghi 5 V; chưa xác nhận 3V3 đủ và giao tiếp DO đúng mức. D1 chỉ thấy điện tại điểm đo |
| MQ-2 | V5 từng đọc AO thật, gửi ADC qua USB/MQTT | VV đang dùng chưa đo 5 V; bộ nung/nguồn và hiệu chuẩn ppm chưa xác nhận |
| DS18B20 | V5 từng gửi nhiệt độ thật khoảng 31°C | Chưa đối chiếu nhiệt kế chuẩn, chưa có bằng chứng đủ trên 2 node |
| RGB/còi | Có code 3 trạng thái, nghỉ HIGH, PWM 2 kHz | Cần quan sát/nghe thực tế trên từng node; lệnh buzzer_cmd không chứng minh tiếng còi |
| Hai node | Code dùng được cấu hình ID/phòng riêng | Chưa có bằng chứng 2 board chạy đầy đủ đồng thời, cần ảnh và bảng nghiệm thu |
| Backend/web | Ngoài gói P1, đã có bộ thử trước đây nhận telemetry | Thành viên khác ghép schema6, quản lý người dùng/thiết bị/cảnh báo và giao diện theo đề |
| Điều khiển từ xa | Chưa có trong firmware tổng | Thống nhất topic, nội dung lệnh, quyền, command_id/ACK, timeout và lịch sử với backend; không dùng nút web giả để ghi đã điều khiển |
| Telegram | Được chọn là chức năng nâng cao dự kiến | Chưa có bot/tích hợp được triển khai trong gói P1 |

Lịch sử kiểm chứng: ngày 25/10/2026 đã nạp V5 lên một ESP, xác minh hash và nhận schema5 từ thiết bị dùng ID node02/phòng 101 qua USB và MQTT. Dữ liệu đó không phải kết quả V6 hay bằng chứng node thứ hai. Bản V6 chuẩn bị thêm giám sát nguồn Flame bằng D1; A0 vẫn dành MQ AO.

Hai node dự kiến có thể là node01/phòng 101 và node02/phòng 102, nhưng nhóm cần chốt ánh xạ trước khi thay ID trên thiết bị và dữ liệu backend. Không đổi ngầm định danh rồi ghép dữ liệu cũ vào phòng mới.

Thứ tự tiếp tục: kiểm tra nguồn/giao tiếp thật → đấu nhánh D1 → biên dịch/nạp V6 theo mạch đã kiểm tra → ghi kết quả node thứ nhất → lắp và kiểm tra node thứ hai → thử cùng backend của nhóm → hoàn thiện ảnh/tài liệu và nghiệm thu.
