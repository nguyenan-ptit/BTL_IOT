# Chân nối và cấu hình firmware

Đây là sơ đồ mà source hiện tại sử dụng trên NodeMCU ESP8266. Đối chiếu chữ in thực tế trên bo/module; ngắt USB và mọi nguồn khác trước khi thay dây. Hướng dẫn nạp ở [README](../README.md), các hằng mặc định ở [config.example.h](../firmware/node_full/config.example.h).

| Chức năng | Chân ESP | Nối theo thiết kế hiện tại |
| --- | --- | --- |
| DS18B20 DATA | D2 / GPIO4 | DATA kéo lên 3V3 bằng điện trở 4,7 kΩ; VDD → 3V3, GND chung. |
| MQ-2 AO | A0 | AO → 47 kΩ → điểm A0; điểm A0 → 10 kΩ → GND chung. Không nối AO/5 V trực tiếp A0. |
| MQ-2 nguồn | Nguồn 5 V phù hợp module | GND chung với ESP; không cấp bộ nung từ 3V3. MQ-2 DO để trống. |
| Flame DO | D0 / GPIO16 | Tín hiệu phải phù hợp mức logic 3,3 V. Flame AO để trống. |
| Flame nguồn | 3V3 / GND chung | Đây là cách cấp nguồn được dùng trong sơ đồ hiện tại; phải xác nhận đúng thông số module thực tế. |
| Flame giám sát nguồn | D1 / GPIO5 | Điểm VCC phía module → 4,7 kΩ → D1; D1 → 47 kΩ → GND chung. Nhánh này chỉ dùng cho 3V3, không dùng 5 V. |
| Còi module I/O | D5 / GPIO14 | I/O → D5, VCC → 3V3, GND chung theo ký hiệu trên module. Cần xác nhận kiểu module/mức kích, không áp dụng mù cho còi hai chân. |
| RGB đỏ | D6 / GPIO12 | Mỗi màu có điện trở 330 Ω riêng. |
| RGB xanh lá | D7 / GPIO13 | RGB âm chung → GND; chân xanh dương để trống vì D0 dùng cho Flame. |

A0 chỉ đọc MQ-2; không ghép thêm nhánh nguồn Flame vào A0. D1 là đầu vào đo nguồn Flame, không cấp nguồn cho cảm biến và không giám sát nguồn MQ-2. Đề xuất chuyển LED/đấu thêm giám sát MQ-2 chưa được thực hiện trong bản này.

## Giá trị mặc định

| Hạng mục | Giá trị trong source mẫu |
| --- | --- |
| DS18B20 cảnh báo / xóa | 60 / 55 °C |
| MQ-2 cảnh báo / xóa | 60 / 55 ADC thô; không phải ppm hoặc ngưỡng đã hiệu chuẩn |
| MQ-2 thời gian chờ sau khởi động | 300 giây; không chứng minh bộ nung đã ổn định |
| MQ-2 lọc trạng thái | 300 ms |
| Flame mức kích DO | LOW; phải xác nhận trên module thật |
| Flame nguồn ổn định / lọc DO | 300 / 100 ms |
| Còi khi thử/báo động | PWM 2 kHz, xấp xỉ 50% trên D5 |
| Còi lúc nghỉ | HIGH theo cấu hình hiện tại; đây là cấu hình phần mềm, chưa thay thế xác nhận âm thanh thực tế |
| Telemetry | Khoảng 2 giây/lần và khi trạng thái thay đổi |
| Thử còi + đỏ nhấp nháy | 3 giây; cảnh báo thật luôn ưu tiên |

Ngưỡng đã lưu LittleFS được dùng sau khởi động lại. Đổi ngưỡng mặc định trong config.h không tự thay ngưỡng đã lưu.

## Điều kiện còn cần nghiệm thu

- DS18B20 có các trạng thái mất/lỗi số đo; MQ-2 chỉ đọc AO và chưa có giám sát đầy đủ mất nguồn 5 V, bộ nung hoặc đứt dây AO.
- D1 chỉ nhận biết điện tại điểm lấy tín hiệu. Tháo module/dây phía sau điểm đo có thể vẫn để điểm đo có điện. Thiếu điện trở kéo xuống hoặc tháo dây D1 có thể để đầu vào trôi nổi.
- Mất nguồn Flame tạo lỗi vàng, không tự tạo báo cháy mới. Cảnh báo thật đã xác nhận hoặc cảnh báo từ cảm biến khác vẫn ưu tiên đỏ/còi.
- Còi/LED trong telemetry là lệnh điều khiển. Cần nghe/nhìn và ghi biên bản riêng theo từng bo; xem [TEST_STATUS](TEST_STATUS.md).

Đây là nguyên mẫu đồ án, không phải hệ thống báo cháy đã được chứng nhận.
