# Sơ đồ nối dây hai node — phần P1

Cập nhật: **26/10/2026**. Mỗi node dùng một ESP8266 NodeMCU và cùng sơ đồ dưới đây; đặt `DEVICE_ID` riêng khi cấu hình firmware.

## Trạng thái bàn giao

- Thiết kế hiện tại đi cùng firmware **V6**, marker `NODE_FULL_V6_FLAME_POWER`.
- V5 đã từng chạy và gửi dữ liệu ở một node. **V6 chưa được nạp vào ESP; chưa xác nhận nhánh nguồn Flame D1 đã lắp.** Người phụ trách đã xác nhận có dư điện trở 4,7 kΩ và 47 kΩ cho nhánh này.
- Chưa có bằng chứng hoàn thành và kiểm thử hai node độc lập. Người tiếp nhận cần ghi kết quả từng node, không coi bản thiết kế là kết quả thử mạch thật.

## Bảng chân cho mỗi node

**Rút USB và mọi nguồn khác trước khi đổi dây.** Đọc chữ trên bo/module; màu dây không xác định chức năng chân.

| Linh kiện/chân | Nối vào | Ghi chú |
|---|---|---|
| DS18B20 VDD | ESP 3V3 | Cấp nguồn cảm biến |
| DS18B20 GND | GND chung | |
| DS18B20 DATA | D2 / GPIO4 | Điện trở 4,7 kΩ riêng từ DATA lên 3V3 |
| MQ-2 VCC | Nguồn 5 V phù hợp đúng module | Hiện người dùng lấy từ VV; **chưa đo xác nhận điện áp và khả năng cấp tải**. Không cấp bộ nung từ 3V3 |
| MQ-2 GND | GND chung | |
| MQ-2 AO | Qua bộ chia 47 kΩ/10 kΩ vào A0 | Sơ đồ bên dưới; không nối thẳng AO vào A0 |
| MQ-2 DO | Để trống | Đã bỏ khỏi D1; V6 dùng AO |
| Flame VCC | Đang nối ESP 3V3 | Đây là cách nối được người dùng xác nhận; chưa biết đúng mã module. Thông tin nơi bán trước đó ghi 5 V, cần xác minh nguồn yêu cầu |
| Flame GND | GND chung | |
| Flame DO | Giao tiếp mức điện áp phù hợp → D0 / GPIO16 | Phải xác nhận điện áp HIGH và mạch giao tiếp theo module thực tế |
| Flame AO | Để trống | A0 đã dành cho MQ-2 |
| Điểm VCC phía Flame | Qua 4,7 kΩ/47 kΩ → D1 / GPIO5 | Nhánh giám sát **chỉ áp dụng VCC 3V3** |
| Còi VCC / GND | 3V3 / GND chung | Module ba chân VCC, I/O, GND; thông tin nơi mua 3,3–5 V, kích PWM |
| Còi I/O | D5 / GPIO14 | Firmware nghỉ HIGH; kêu bằng PWM 2 kHz, khoảng 50% |
| RGB chân âm chung | GND chung | Loại common cathode; xác định chân theo đúng LED |
| RGB đỏ R | D6 / GPIO12 qua 330 Ω riêng | |
| RGB xanh lá G | D7 / GPIO13 qua 330 Ω riêng | |
| RGB xanh dương B | Để trống | Không dùng D0 cho LED vì D0 dành cho Flame |

## Ba nhánh điện trở tách biệt

```text
DS18B20:
3V3 ── 4,7 kΩ ──●── DATA DS18B20
                 └── D2 ESP

MQ-2 analog:
AO MQ-2 ── 47 kΩ ──●── A0 ESP
                    │
                   10 kΩ
                    │
                 GND chung

Giám sát nguồn Flame, CHỈ nguồn 3V3:
ESP 3V3 ── dây cấp nguồn ──●── VCC Flame (phía module)
                           │
                         4,7 kΩ
                           │
                           ●── D1 ESP
                           │
                          47 kΩ
                           │
                        GND chung
```

Mỗi điện trở trong sơ đồ là một linh kiện riêng. Không lấy điện trở kéo lên DS18B20 hoặc bộ chia MQ-2 để dùng đồng thời cho D1. Không nối các điểm A0, D1 và D0 với nhau.

Nhánh D1 cho mức danh định khoảng 3,0 V khi VCC Flame là 3,3 V. **Không nối nhánh này vào VV/5 V:** mức tại D1 sẽ vượt giới hạn ESP8266. Firmware dùng `INPUT`, vì vậy điện trở 47 kΩ kéo xuống GND là cần thiết.

Điểm lấy tín hiệu phải ở phía module, sau dây cấp nguồn muốn theo dõi. D1 chỉ thấy điện tại điểm đó: nếu tháo module ở phía sau mà điểm đo vẫn có 3V3, phần mềm vẫn thấy nguồn. Nhánh này không đo chính xác điện áp và không chẩn đoán mọi lỗi GND, DO, đầu thu quang hoặc module hỏng.

## Phần còn phải xác minh trước khi cấp điện/nạp V6

1. Xác nhận model Flame và điện áp hoạt động thực tế. Không tự đổi VCC từ 3V3 sang 5 V khi vẫn giữ nhánh D1 trên.
2. Xác nhận giao tiếp Flame DO → D0. Bộ chia từng chọn cho HIGH 5 V có thể làm HIGH 3V3 quá thấp; không tự đấu tắt khi chưa biết điện áp đầu ra.
3. Kiểm tra nguồn MQ-2 và dây nguồn. Mạch từng có cảnh báo USB quá dòng; nếu tái diễn, rút nguồn và xử lý trước khi thử tiếp. LED nguồn sáng không xác nhận điện áp đủ hoặc nguồn ổn định.
4. Xác nhận D1 đã trống dây MQ-2 DO cũ và có nhánh giám sát đúng. Sau đó mới nạp V6 và thử từng node theo kịch bản kiểm thử.

Trên breadboard, A–E cùng số hàng nối điện với nhau; F–J là nhóm riêng phía bên kia rãnh. Hai chân mỗi điện trở phải ở hai nhóm điện khác nhau. Thanh nguồn có thể đứt đoạn giữa; cần kiểm tra theo breadboard thực tế.

## Quy ước trạng thái dự kiến của V6

| Trạng thái | LED/còi |
|---|---|
| Dữ liệu hiện tại hợp lệ theo phần mềm, chưa có cảnh báo | Xanh lá liên tục |
| Có cảnh báo đã xác nhận từ nhiệt độ, MQ-2 hoặc Flame | Đỏ nhấp nháy + còi |
| Chờ/thiếu/lỗi dữ liệu hoặc mất nguồn Flame, chưa có cảnh báo | Vàng, web chỉ rõ nguyên nhân |
| Đã có cảnh báo Flame rồi mới mất nguồn Flame | Giữ đỏ/còi; lỗi nguồn không tự xóa cảnh báo |

MQ-2 có thời gian chờ phần mềm 300 giây sau khởi động. Nhánh nguồn Flame cần ổn định 300 ms rồi DO ổn định thêm 100 ms. Đèn xanh không phải bằng chứng toàn bộ phần cứng đã được chẩn đoán đầy đủ.

## Tài liệu kỹ thuật

- [ESP8266EX: giới hạn điện áp và mức logic](https://www.espressif.com/sites/default/files/documentation/0a-esp8266ex_datasheet_en.pdf).
- [Arduino ESP8266: Digital IO](https://arduino-esp8266.readthedocs.io/en/latest/reference.html#digital-io), [ADC](https://arduino-esp8266.readthedocs.io/en/latest/reference.html#analog-input).
- [DS18B20: nguồn, dữ liệu 1-Wire và điện trở kéo lên](https://www.analog.com/media/en/technical-documentation/data-sheets/ds18b20.pdf).
