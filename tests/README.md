# Kiểm thử phần P1

Các mục dưới đây là mã/kịch bản để nhóm kiểm tra tiếp, không phải xác nhận mọi bài thử đã đạt trên hai node.

## Kiểm tra tại thời điểm biên dịch

`alarm_policy.h` có 25 kiểm tra chính sách/ngưỡng; `flame_monitor.h` có 6 chuỗi kiểm tra nguồn/DO. Chúng chỉ được đánh giá khi bật `ALARM_POLICY_SELF_TEST`.

Sau khi tạo `firmware/node_full/config.h` từ file mẫu, có thể dùng Arduino CLI đã cài sẵn:

```powershell
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 --build-property "compiler.cpp.extra_flags=-DALARM_POLICY_SELF_TEST" firmware/node_full
```

Lệnh trên chỉ biên dịch, không nạp hay tác động thiết bị. Nếu CLI không nằm trong PATH, dùng đường dẫn cài Arduino CLI của máy. Thư viện/core xem README của gói.

## Ba sketch thử riêng

| Thư mục | Mục đích và cách chuẩn bị |
|---|---|
| `firmware/usb_stability_test/` | Chỉ ESP với USB, tháo cảm biến khi đã ngắt nguồn; Serial có `ESP OK` tăng đều |
| `firmware/ds18b20_test/` | DS DATA=D2, 4,7k kéo lên 3V3; hiển thị số đo để kiểm tra bước đầu |
| `firmware/mq2_test/` | MQ AO qua 47k/10k vào A0; chỉ in ADC thô, không ppm |

Mỗi sketch có `.ino` cùng tên thư mục, mở riêng trong Arduino IDE. Serial 115200. Nạp sketch thử sẽ thay firmware tổng trên ESP. DS sketch đơn giản có thể hiển thị giá trị khởi tạo mà firmware tổng sẽ kiểm tra kỹ hơn; không dùng nó để bỏ qua các health/CRC/nguồn của firmware tổng.

Các bản thử còi nghỉ LOW và RGB ba màu/D0 cũ không được đóng gói vì khác cấu hình V6 hiện tại: còi đang đặt nghỉ HIGH, D0 dành riêng cho Flame và RGB B để trống. Kiểm tra còi/RGB theo các ca trong `hardware-test-cases.md` với firmware tổng; không nạp nhầm code làm D0 thành OUTPUT khi vẫn nối Flame.

## Kiểm thử trên mạch

Thực hiện và ghi lại `hardware-test-cases.md` cho từng node. Khi chưa thực hiện, giữ kết quả là **Chưa thử**; không tự ghi Đạt dựa trên mô phỏng hay biên dịch. Không tạo lửa/rò khí để thử. Kiểm tra ngưỡng/ưu tiên bằng các bộ kiểm tra phần mềm; mọi thay đổi dây đều làm khi đã rút mọi nguồn.

## Kết quả khi chuẩn bị gói ngày 26/10/2026

- Đã sao chép cấu hình mẫu của chính gói này thành `config.h` trong thư mục biên dịch tạm, biên dịch firmware tổng với `ALARM_POLICY_SELF_TEST`: đạt cả 31 kiểm tra tại thời điểm biên dịch. Không nạp vào ESP.
- Ba JSON mô phỏng trong `docs/telemetry-examples/` đã qua validator schema6 của bộ backend thử nghiệm hiện có. Chúng không được gửi vào broker/database vận hành.
- Ba sketch thử riêng được giữ nguyên từ mã nguồn trước đó; chưa biên dịch lại cả ba hoặc kiểm tra lại trên hai board trong lần đóng gói này.
- Đã đối chiếu mã firmware tổng với nguồn V6, kiểm tra cấu hình mẫu và danh sách file: gói không có `config.h` thật, database, `.bak` hoặc log vận hành. Kết quả phần cứng vẫn chờ theo bảng kịch bản.
