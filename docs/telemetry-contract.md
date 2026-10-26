# Hợp đồng dữ liệu từ firmware P1 — V6

Tài liệu dành cho thành viên làm backend/frontend. Phần P1 gửi telemetry và tự điều khiển LED/còi tại ESP. Đây là prototype học tập; các ngưỡng hiện tại dùng để thử, không phải hệ thống báo cháy đã hiệu chuẩn.

## Tình trạng bàn giao

- Mã V6 đã được chuẩn bị, **chưa có xác nhận nạp V6 và hoàn tất nhánh kiểm tra nguồn D1 trên mạch thật**.
- Bản chạy thật được ghi nhận trước đó là V5, thiết bị `node02`, phòng `101`. Điều này không chứng minh thiết bị đang trực tuyến hoặc cả hai node đã hoàn tất.
- Bảng ID cho hai node cần nhóm thống nhất trước khi nạp. Có thể đề xuất `node01`/`node02`, nhưng phải đặt `DEVICE_ID` khác nhau và ghi đúng `ROOM_ID` của từng mạch thật.
- Ba JSON trong `telemetry-examples/` là **dữ liệu mô phỏng độc lập**, không phải bản ghi đo thật và không phải chuỗi diễn biến liên tiếp.

## Kết nối và nhịp gửi

| Thuộc tính | Giá trị hiện tại |
|---|---|
| Giao thức | MQTT, payload JSON UTF-8 |
| Topic telemetry | `iot/test` (cấu hình trong firmware) |
| QoS / retain | `0` / `false` |
| Client ID | `DEVICE_ID`; bắt buộc duy nhất cho mỗi node để tránh ngắt kết nối lẫn nhau |
| Broker / cổng | Điền cấu hình môi trường của nhóm; cổng mẫu hiện là `1884` |
| Nhịp gửi | Khoảng 2 giây khi đã nối MQTT, hoặc khi **trạng thái hệ thống** đổi giữa `normal`/`fault`/`alarm` |
| Khi mất MQTT | Cảm biến và điều khiển tại ESP tiếp tục chạy; không có bộ đệm lưu bù telemetry để gửi lại |

Các lời gọi kết nối mạng có thể chặn vòng lặp trong thời gian hữu hạn, nên không coi nhịp 2 giây là cam kết thời gian thực. Thay đổi một giá trị/health nhưng không đổi trạng thái hệ thống sẽ được gửi ở nhịp định kỳ. QoS 0 có thể mất bản tin; không dùng khoảng trống `seq` làm bằng chứng hỏng cảm biến.

## Cấu trúc JSON V6

| Trường | Kiểu và ý nghĩa |
|---|---|
| `schema_version` | Số nguyên `6` |
| `test` | Boolean `true`: nhãn prototype/TEST của firmware. **Không có nghĩa tất cả bản tin đều là dữ liệu mô phỏng**; firmware cũng gắn nhãn này cho số đo thật |
| `device_id`, `room` | Chuỗi 1–32 ký tự gồm chữ, số, `_`, `-`; `room` vẫn là chuỗi kể cả tên phòng chỉ có số |
| `boot_id` | Chuỗi 16 ký tự hex thường, tạo lúc khởi động; giúp phân biệt các phiên chạy |
| `seq` | Số nguyên 0…4294967295. Tăng trước mỗi lần thử publish; có thể có khoảng trống và đặt lại sau khởi động |
| `uptime_s` | Số giây ESP đã chạy trong phiên hiện tại, **không phải thời gian lịch** |
| `system_state` | `normal`, `fault`, `alarm` |
| `led` | Tương ứng `green`, `yellow`, `red_blink` |
| `buzzer_cmd` | Boolean lệnh bật còi; không phải phản hồi xác nhận còi thực sự phát âm |
| `temperature` | Đối tượng DS18B20, chi tiết bên dưới |
| `mq2` | Đối tượng MQ-2 analog, chi tiết bên dưới |
| `flame` | Đối tượng Flame DO và tín hiệu nguồn D1, chi tiết bên dưới |
| `network` | `{ "wifi": boolean, "mqtt": boolean }`, trạng thái ESP biết tại lúc tạo bản tin |
| `limits` | `{ "temperature_on_c": number, "temperature_off_c": number }`; ngưỡng bật lớn hơn ngưỡng tắt |

Backend nên tự thêm thời điểm nhận theo đồng hồ máy chủ, lưu cùng `device_id`, `boot_id`, `seq` và dữ liệu gốc. Không đổi `uptime_s` thành thời gian ngày/giờ nếu không có thông tin đồng bộ. Trạng thái online/offline phải dựa vào tuổi bản tin nhận gần nhất; `network.mqtt=true` trong bản tin cũ không chứng minh node vẫn đang online.

### DS18B20 — `temperature`

- `value_c`: số trong khoảng −55…125 khi `health="ok"`; **`null` khi health khác `ok`**. Không hiển thị giá trị cũ như số đo mới hợp lệ.
- `health`: `ok`, `pending`, `missing`, `read_error`, `conversion_timeout`, `power_reset`, `insufficient_power`, `stale`.
- `alarm`: boolean. Có thể giữ `true` khi cảm biến lỗi sau một lần xác nhận quá nhiệt; chỉ số đo hợp lệ an toàn mới xóa cảnh báo.
- Mặc định thử hiện tại: bật ở **≥60°C**, tắt ở **≤55°C**; trong khoảng giữa giữ trạng thái trước.

### MQ-2 — `mq2`

| Trường | Giá trị / ý nghĩa |
|---|---|
| `mode` | `"analog"` |
| `do_level` | Luôn `null`; DO không được dùng ở V6 |
| `adc_raw` | Số nguyên 0…1023; `null` khi `health="disabled"` |
| `adc_on`, `adc_off` | Ngưỡng bật/tắt ADC; mặc định `60` / `55`, với `adc_off < adc_on` |
| `health` | `ok`, `warming_up`, `filtering`, `disabled` |
| `alarm` | Boolean trạng thái cảnh báo sau làm nóng và lọc |
| `diagnostics` | `"limited_analog"` |
| `warmup_remaining_s` | Số nguyên giây còn chờ; mặc định thời gian chờ ban đầu 300 giây |

`adc_raw` là **số ADC thô, không phải ppm, phần trăm khí hay mức độ cháy**. Giá trị 0 không đủ để kết luận MQ-2 hỏng hoặc hoạt động tốt. `filtering` nghĩa là đang chờ điều kiện vượt/xuống ngưỡng ổn định 300 ms; `alarm` lúc này có thể vẫn giữ trạng thái trước. Đèn nguồn sáng và ADC thay đổi cũng không thay thế việc xác nhận nguồn heater phù hợp.

### Flame — `flame`

| Trường | Giá trị / ý nghĩa |
|---|---|
| `do_level` | `0`/`1` khi `health` là `ok` hoặc `filtering`; `null` khi `disabled`, `power_checking`, `power_missing` |
| `health` | `ok`, `filtering`, `disabled`, `power_checking`, `power_missing` |
| `alarm` | Boolean; có thể giữ cảnh báo đã xác nhận khi nguồn/tín hiệu sau đó lỗi |
| `alarm_level` | `0` hoặc `1`; mặc định `0` (LOW kích cảnh báo) |
| `diagnostics` | `"limited_do"` |
| `power_mode` | `"digital_d1"` |
| `power_level` | Mức D1 thô `0` hoặc `1`, vẫn được gửi khi đang kiểm tra hoặc Flame bị tắt trong cấu hình |
| `power_health` | `checking`, `present`, `missing` |
| `power_adc`, `power_adc_min`, `power_adc_zero` | Luôn `null` ở V6; A0 dành cho MQ-2 |

Sau khi D1 ổn định 300 ms: mức 1 thành `present`, mức 0 thành `missing`. Chỉ khi đã xác nhận `present` mới bắt đầu lọc DO 100 ms. Khi D1 vừa đổi mức, `power_health="checking"` và không nhận cảnh báo DO mới. `present` đi cùng `power_level=1`, `missing` đi cùng `power_level=0`; `checking` có thể đi cùng một trong hai mức.

Nhánh D1 được thiết kế cho **điểm VCC Flame thực tế 3V3**: VCC ngay phía module → 4,7 kΩ → D1; D1 → 47 kΩ → GND chung. Chỉ kiểm tra sự hiện diện điện áp tại điểm lấy tín hiệu, không đo số volt, không chứng minh đầy đủ mạch/đầu dò/GND/DO tốt. Nếu điểm lấy tín hiệu vẫn có nguồn khi tháo module ở phía sau, D1 có thể vẫn báo `present`. Không dùng nhánh này trực tiếp với 5V/VV. Việc module đang được cấp 3V3 không tự chứng minh loại module đó hoạt động đúng ở 3V3.

## Quy tắc trạng thái và giao diện

1. Có bất kỳ `temperature.alarm`, `mq2.alarm`, `flame.alarm` bằng `true` → **`alarm` + `red_blink` + `buzzer_cmd=true`**, kể cả khi đồng thời có lỗi cảm biến.
2. Không có alarm và cả ba cảm biến có `health="ok"` (nguồn Flame đã `present`) → **`normal` + `green` + `buzzer_cmd=false`**.
3. Các trường hợp còn lại → **`fault` + `yellow` + `buzzer_cmd=false`**.

Ví dụ mất nguồn Flame khi chưa có alarm → vàng. Nếu đã xác nhận lửa rồi mới mất nguồn → giữ đỏ/còi, đồng thời hiển thị lỗi nguồn và ghi rõ cảnh báo đang được giữ. Không đổi một cảnh báo đang giữ thành “an toàn” chỉ vì số đo chuyển thành `null`.

`health="ok"` nghĩa là lần đọc được chấp nhận theo các kiểm tra hiện có, không bảo đảm phát hiện mọi hỏng hóc. Frontend cần hiển thị lỗi theo từng cảm biến và phân biệt lỗi với alarm, ngay cả khi màu tổng đang ưu tiên đỏ. Màu trên web cho node offline cần dựa vào thời điểm nhận của backend và phân biệt rõ dữ liệu cũ.

## Phần cần thành viên khác triển khai

- Backend: subscribe topic, xác thực JSON theo schema, lưu telemetry/thời điểm nhận, quản lý node, phát sinh và xử lý cảnh báo, cung cấp API cho giao diện.
- Frontend: danh sách node, số đo có đơn vị đúng, biểu đồ ADC thô và °C, health từng cảm biến, online/offline, lịch sử và luồng xử lý cảnh báo.
- **Firmware hiện chỉ gửi telemetry: chưa subscribe topic lệnh, chưa có bộ xử lý điều khiển từ xa và chưa có ACK.** Chưa được ghi rằng web/bot đã đổi ngưỡng, tắt còi hoặc cấu hình ESP thành công. Nhóm phải thống nhất hợp đồng command/ACK và bổ sung firmware, quyền điều khiển, xử lý lỗi trước khi triển khai các nút đó.
- Các ngưỡng đang chỉnh bằng `config.h` rồi nạp lại. Xử lý/ghi nhận cảnh báo trên web là nghiệp vụ của backend; không tự động đồng nghĩa với tắt cảnh báo tại ESP.
- V2–V5 là dữ liệu cũ có cấu trúc khác; không tự chuyển thành V6 hay điền giả tín hiệu nguồn D1. Nếu hỗ trợ chúng, hiển thị rõ giới hạn và yêu cầu nâng cấp phù hợp.

## Ví dụ và kiểm tra

- `telemetry-examples/simulated_normal.json`: cả ba cảm biến đọc được, không có alarm.
- `telemetry-examples/simulated_alarm.json`: DO Flame LOW đã xác nhận, cảnh báo đỏ/còi.
- `telemetry-examples/simulated_power_missing.json`: mất tín hiệu nguồn Flame, chưa có alarm trước đó, báo lỗi vàng.

Ba ví dụ dùng ID demo và không có mật khẩu/token. Chúng cần vượt qua validator V6 hiện tại; việc vượt validator chỉ xác nhận cấu trúc và tính nhất quán JSON, không xác nhận phần cứng hay kết nối mạng thật.
