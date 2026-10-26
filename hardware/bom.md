# Danh sách linh kiện đề xuất cho hai node

Cập nhật: **26/10/2026**. Đây là số lượng theo thiết kế, **không phải biên bản đã mua, đã lắp hoặc đã thử đủ hai node**. Hai node dùng chung cấu trúc; xem [bảng nối dây](wiring.md).

| Linh kiện | Mỗi node | Hai node | Yêu cầu/ghi chú |
|---|---:|---:|---|
| ESP8266 NodeMCU, USB-C | 1 | 2 | Cấu hình đang dùng là NodeMCU ESP-12E; đối chiếu chân trên bo thực tế |
| DS18B20 đầu dò dây chống nước | 1 | 2 | VDD, GND, DATA; không xác định dây chỉ theo màu |
| Module MQ-2, AO/DO | 1 | 2 | Dùng AO; nguồn bộ nung phải phù hợp module |
| Module Flame, VCC/GND/DO/AO | 1 | 2 | Cần xác minh model và điện áp; nguồn hiện nối 3V3, nơi bán từng ghi 5 V |
| Module còi ba chân VCC/I/O/GND | 1 | 2 | Loại 3,3–5 V, kích PWM theo thông tin nơi mua; cần kiểm tra mức nghỉ HIGH thực tế |
| LED RGB bốn chân, âm chung | 1 | 2 | Dùng đỏ + xanh lá để tạo đỏ/xanh/vàng; xanh dương để trống |
| Điện trở 4,7 kΩ | 2 | 4 | Một cho DS18B20 kéo lên DATA; một cho nhánh nguồn Flame → D1 |
| Điện trở 47 kΩ | 2 | 4 | Một cho MQ-2 AO; một kéo xuống D1 |
| Điện trở 10 kΩ | 1 | 2 | Kéo xuống điểm A0 trong bộ chia MQ-2 |
| Điện trở 330 Ω | 2 | 4 | Một riêng cho RGB đỏ, một riêng cho RGB xanh lá |
| Giao tiếp logic phù hợp Flame DO → ESP 3,3 V | 1 kênh | 2 kênh | Chưa chốt linh kiện/mạch; lựa chọn sau khi xác minh điện áp và đầu ra module |
| Breadboard | 1 bộ | 2 bộ | Đủ chỗ cho ESP, các nhánh điện trở và dây; số tấm tùy kích thước |
| Dây jumper tương thích | 1 bộ | 2 bộ | Số lượng theo cách bố trí, dự phòng dây nguồn/tín hiệu |
| Cáp USB có truyền dữ liệu, đầu phù hợp | 1 | 2 | Cáp và cổng phải ổn định; lịch sử từng gặp ngắt COM/USB quá dòng |
| Nguồn cấp phù hợp | 1 bộ | 2 bộ | Tính theo tải thực tế; chưa xác nhận nguồn độc lập hoặc điện áp chân VV |

Các điện trở trong bảng **chưa bao gồm** linh kiện có thể cần thêm cho giao tiếp DO của Flame. Nhánh D1 dùng 4,7 kΩ/47 kΩ chỉ dành cho nguồn Flame 3V3; không áp dụng cho 5 V.

## Cần bổ sung khi bàn giao mạch thật

- Mã/model, điện áp danh định và đường dẫn tài liệu của từng module.
- Bảng tồn kho thực tế, linh kiện thiếu và số lượng dự phòng.
- Ảnh nhãn chân và ảnh toàn mạch từng node; xem [hướng dẫn ảnh](images/README.md).
- Kết quả đo/xác minh nguồn và giao tiếp DO; kết quả kiểm thử hai node riêng biệt.
