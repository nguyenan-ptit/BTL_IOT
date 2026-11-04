# JSON mô phỏng để Long tích hợp MQTT

**Tất cả tệp ở đây là MÔ PHỎNG**, dùng ID demo và mã hex giả. Không phải số đo thật, không phải lệnh đã gửi và không dùng làm biên bản nghiệm thu. Các số uptime/hạn dùng chỉ minh họa một lần chạy giả, không dùng lại để điều khiển thiết bị đang vận hành.

| Tệp | Nội dung |
| --- | --- |
| [telemetry-normal.json](telemetry-normal.json) | Telemetry schema 6 đầy đủ, cảm biến bình thường. |
| [telemetry-fault.json](telemetry-fault.json) | Telemetry đầy đủ, Flame mất tín hiệu nguồn, LED vàng/còi tắt. |
| [telemetry-output-test.json](telemetry-output-test.json) | Telemetry đầy đủ, thử còi/đèn version 2 đang chạy, không tạo alarm cảm biến. |
| [command-thresholds.json](command-thresholds.json) | MQTT config/set, đủ bốn ngưỡng. |
| [command-output-test-start.json](command-output-test-start.json) | MQTT buzzer/test action=start, expected_seq=0. |
| [command-output-test-stop.json](command-output-test-stop.json) | MQTT buzzer/test action=stop sau start, expected_seq=1. |
| [ack-thresholds-fragment.json](ack-thresholds-fragment.json) | Chỉ trích đoạn ACK ngưỡng trong telemetry, không phải bản tin độc lập hợp lệ. |
| [ack-output-test-completed-fragment.json](ack-output-test-completed-fragment.json) | Chỉ trích đoạn ACK completed trong telemetry. |

Đọc [MQTT_CONTRACT](../docs/MQTT_CONTRACT.md) để lấy topic, kiểu/null, đơn vị, cửa sổ hạn dùng và điều kiện ACK. seq telemetry khác command_seq; received_at do phía nhận tạo, không phải trường timestamp được ESP gửi.
