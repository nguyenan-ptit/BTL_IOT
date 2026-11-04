# Hợp đồng MQTT của firmware

Tài liệu này mô tả hợp đồng firmware ESP và dữ liệu mẫu. Repo kèm backend FastAPI prototype trong `backend/`: subscriber, validation schema 6, SQLite storage và API đã được kiểm tra với node02 trên EMQX Cloud. Long tiếp tục chuyển storage sang MySQL, tích hợp frontend và hoàn thiện triển khai; giữ topic/payload tương thích. Tất cả [JSON mẫu](../examples/README.md) là MÔ PHỎNG, không phải dữ liệu thật hay lệnh đã gửi.

## 1. Topic, định danh và kênh truyền

| Topic | Chiều từ góc nhìn ESP | QoS | Retained |
| --- | --- | --- | --- |
| `iot/devices/<device_id>/telemetry` | Gửi số đo, heartbeat, trạng thái và xác nhận | 0 | false |
| `iot/devices/<device_id>/config/set` | Nhận bốn ngưỡng | 1 | false |
| `iot/devices/<device_id>/buzzer/test` | Nhận start/stop thử còi và đèn | 1 | false |

Phía nhận đăng ký `iot/devices/+/telemetry`. ID trong topic phải khớp device_id trong payload; phía nhận cần loại topic sai cấu trúc, sai ID và dữ liệu được chuyển đến với cờ retained. Không dùng topic cũ iot/test.

DEVICE_ID và ROOM_ID là chuỗi ASCII 1–32 ký tự chữ/số/gạch dưới/gạch ngang. DEVICE_ID cũng là MQTT client ID và phải riêng cho từng bo; ROOM_ID biểu diễn vị trí và có thể trùng. Tài khoản MQTT độc lập với ID. Cấu hình kết nối thật được giữ cục bộ, không nằm trong repo công khai; xem [config.example.h](../firmware/node_full/config.example.h).

Firmware có hai chế độ cấu hình, dùng cùng topic và payload trong tài liệu này:

- Mặc định `MQTT_USE_TLS=0` (hoặc cấu hình cũ không khai báo macro): IPv4 và TCP MQTT trong LAN, cổng mẫu 1884; có thể dùng signed discovery bên dưới.
- Cloud opt-in `MQTT_USE_TLS=1`: hostname DNS chính xác do nhà cung cấp cấp, cổng TLS của dịch vụ (thường 8883), TLS 1.2 với CA PEM trong `mqtt_ca.h` và thời gian SNTP để kiểm tra hạn chứng chỉ. `MQTT_HOST` không chứa `mqtts://`, đường dẫn, `:port` hoặc IP literal. Hostname được giữ cho DNS, SNI và kiểm tra tên chứng chỉ. Thiếu/sai CA hoặc hostname làm cấu hình mạng không được bật; đồng hồ chưa sẵn sàng thì chờ trước khi nối. Không có fallback sang TCP thường và không chạy signed LAN discovery trong chế độ này.

Broker, thông tin truy cập và phân quyền publish/subscribe cấu hình riêng ngoài Git. Hướng dẫn firmware cloud nằm trong [CLOUD_MQTT](CLOUD_MQTT.md); cách cấu hình subscriber FastAPI nằm trong [backend README](../backend/README.md). Lần kiểm tra thủ công hiện tại nhận telemetry node02; xem [TEST_STATUS](TEST_STATUS.md).

## 2. Telemetry schema 6

Ba bản tin đầy đủ đã được kiểm tra hợp lệ:

- [Bình thường](../examples/telemetry-normal.json).
- [Lỗi nguồn Flame](../examples/telemetry-fault.json).
- [Đang thử còi và đèn](../examples/telemetry-output-test.json).

| Trường | Kiểu, đơn vị và quy tắc |
| --- | --- |
| schema_version / test | Bắt buộc nguyên 6 và boolean true trong nguyên mẫu này. |
| device_id / room | Chuỗi theo quy tắc ID. |
| boot_id | 16 ký tự hex thường, thay sau khởi động. |
| seq | Nguyên không âm 32 bit; bộ đếm telemetry trong lần chạy, có thể có khoảng trống khi gửi thất bại. |
| uptime_s | Nguyên không âm, giây hoạt động; không phải UTC/Unix timestamp. |
| system_state | normal / fault / alarm theo cảm biến. |
| led / buzzer_cmd | green / yellow / red_blink và boolean, là lệnh đầu ra phần mềm. |
| temperature | value_c: số °C hoặc null; health; alarm boolean. Lỗi số đo phải null, không gửi số cũ như số đo mới. |
| mq2 | mode=analog, do_level=null, adc_raw nguyên 0–1023 hoặc null khi disabled; adc_on/adc_off nguyên; health; alarm boolean; diagnostics=limited_analog; warmup_remaining_s nguyên giây. ADC không phải ppm. |
| flame | do_level nguyên 0/1 hoặc null khi chưa hợp lệ; health, alarm, alarm_level 0/1; diagnostics=limited_do; power_mode=digital_d1; power_level nguyên 0/1; power_health; power_adc/power_adc_min/power_adc_zero đều null. |
| network | wifi/mqtt là boolean. Chưa gửi được MQTT thì không thể dùng trường này báo offline tức thời cho phía nhận. |
| limits | temperature_on_c/temperature_off_c: ngưỡng °C đang dùng. |
| remote_config | Tùy chọn khi bộ lưu sẵn sàng: version=1, revision nguyên 32 bit, last_request_id. Revision 0 dùng ID rỗng; revision lớn hơn 0 dùng 32 hex thường. |
| buzzer_test | version=2, command_seq nguyên 32 bit, last_request_id, status, active boolean, remaining_ms nguyên 0–3000. |

Health nhiệt độ: ok/pending/missing/read_error/conversion_timeout/power_reset/insufficient_power/stale. MQ-2 analog: ok/warming_up/filtering/disabled. Flame schema 6: ok/filtering/disabled/power_checking/power_missing; power_health là checking/present/missing.

Power present cần D1=1; missing cần D1=0. Flame nguồn chưa hợp lệ/disabled gửi do_level=null. ADC 0 không tự chứng minh MQ-2 hỏng hoặc tốt. Không dùng boolean thay số nguyên, chuỗi thay số hoặc NaN/Infinity.

**seq khác buzzer_test.command_seq.** Lệnh thử dùng bộ đếm command_seq. Lúc idle: command_seq=0, last_request_id rỗng, active=false, remaining_ms=0. Sau lệnh: ID 32 hex thường; running đi với active=true và remaining_ms>0; completed/stopped/blocked/interrupted đi với active=false, remaining_ms=0.

Khi thử đầu ra v2, LED đỏ nhấp nháy/còi bật nhưng system_state và các cờ alarm vẫn theo cảm biến. Không tạo sự cố cháy chỉ từ led=red_blink hoặc buzzer_cmd=true. Cảm biến lỗi vẫn có thể giữ system_state=fault trong lượt thử. Phiên bản metadata v1 cũ chỉ thử còi; nếu phía nhận hỗ trợ lịch sử cũ thì cần phân biệt capability, không coi v1 là bản thử chung.

## 3. Lệnh đổi ngưỡng và ACK

Ví dụ đầy đủ: [command-thresholds.json](../examples/command-thresholds.json). Các trường bắt buộc:

| Trường | Giá trị |
| --- | --- |
| request_id | 32 ký tự hex thường, riêng cho yêu cầu. |
| boot_id | Boot hiện tại từ telemetry. |
| expected_revision | remote_config.revision hiện tại. |
| expires_uptime_s | Hạn dùng theo giây uptime, không phải giờ UTC. |
| thresholds | Đủ mq2_on, mq2_off, temperature_on_c, temperature_off_c. |

MQ-2 on nguyên 1–1023, off nguyên 0–1022; nhiệt độ −55 đến 125 °C, tối đa một chữ số thập phân. Mọi off phải nhỏ hơn on. Không nhận trường lạ hoặc giá trị bool thay số.

Firmware yêu cầu đúng boot/revision, hạn còn ở tương lai và không xa hơn 45 giây, request chưa áp dụng, giá trị khác ngưỡng hiện tại. Chỉ áp dụng sau khi lưu/đọc kiểm tra LittleFS thành công; revision tăng một, ngưỡng còn sau khởi động lại.

ACK nằm trong telemetry, không có topic ACK riêng: last_request_id khớp, revision=expected_revision+1, cả bốn ngưỡng trả về đúng. Xem [đoạn ACK ngưỡng](../examples/ack-thresholds-fragment.json); đây là đoạn rút gọn, không phải telemetry độc lập.

Nếu bốn ngưỡng đã đúng, phía gửi nên trả kết quả “đang dùng ngưỡng này” mà không publish. Firmware không áp dụng lại giá trị giống nhau; không chờ một revision/request ID mới trong trường hợp đó. Đừng coi MQTT PUBACK là xác nhận ngưỡng đã áp dụng.

## 4. Lệnh thử còi và LED đỏ

Ví dụ: [start](../examples/command-output-test-start.json), [stop](../examples/command-output-test-stop.json). Cả hai có request_id, boot_id, expected_seq, expires_uptime_s và action=start hoặc stop. expected_seq lấy từ buzzer_test.command_seq; không có trường thời lượng tùy ý.

ESP kiểm tra boot, bộ đếm, chống lặp ID và hạn dùng như trên rồi tăng command_seq một đơn vị cho lệnh được chấp nhận. Phía gửi xác nhận bằng telemetry version 2, cùng boot, đúng last_request_id và command_seq=expected_seq+1:

- Start có thể nhận running, completed, blocked hoặc interrupted.
- Stop nhận stopped. Nếu phía gửi biết active=false, có thể không gửi stop; không chờ command_seq tăng khi không publish.
- Có cảnh báo thật trước khi bắt đầu → blocked; xuất hiện trong lượt thử → interrupted.
- Hết 3000 ms tại ESP → completed, trả đầu ra về trạng thái cảm biến hiện tại, kể cả khi mất mạng. Stop không tắt cảnh báo thật. Start thêm trong lượt thử không kéo dài timer.

Xem [đoạn ACK kết thúc](../examples/ack-output-test-completed-fragment.json). ACK là trạng thái phần mềm, không chứng minh âm thanh/ánh sáng vật lý; cần nghiệm thu riêng.

## 5. Thời gian, vòng đời và khuyến nghị phía nhận

Telemetry chưa có timestamp UTC cho thời điểm lấy mẫu. SNTP trong chế độ TLS phục vụ kiểm tra chứng chỉ, không bổ sung timestamp đo vào payload. Backend prototype đã tạo `received_at` bằng đồng hồ server lúc nhận và lưu ISO 8601 UTC; khi chuyển MySQL, giữ nguyên quy tắc này. Không đổi uptime_s thành thời gian đo tuyệt đối nếu chưa có cơ chế đồng bộ phù hợp.

Các quy ước để tích hợp tương thích:

- Telemetry khoảng 2 giây/lần hoặc khi đổi trạng thái, đồng thời làm heartbeat. Chưa có topic heartbeat hoặc MQTT LWT riêng.
- Backend hiện đánh dấu offline khi không có telemetry hợp lệ mới trong 20 giây.
- SQLite prototype đã chống trùng theo (device_id, boot_id, seq); bản trùng không làm mới received_at/online. Boot mới cho phép seq bắt đầu lại. Giữ hành vi này khi chuyển MySQL.
- Phía gửi nên chờ ACK 20 giây và có trạng thái pending/timeout, không tự lặp một lượt thử. Có thể tạo expires_uptime_s từ uptime mới nhất + tuổi mẫu + 20 giây, nhưng phải giữ trong cửa sổ còn hiệu lực tối đa 45 giây tại ESP.
- Wi-Fi thử lại khoảng 15 giây, MQTT khoảng 10 giây, đăng ký lại topic sau khi nối. Chế độ cloud dùng timeout 2000 ms cho MQTT connect/subscribe và 1000 ms sau khi kết nối để giảm lỗi đọc mạng `LWMQTT_NETWORK_TIMEOUT`; DNS, TCP connect và TLS handshake đồng bộ là các bước riêng, có thể lâu hơn timeout packet và làm chậm vòng lấy mẫu. Lượt thử đầu ra đang hoạt động tránh mở lượt reconnect mới. Chưa đo độ trễ/heap ở tải thật; xem [TEST_STATUS](TEST_STATUS.md).
- Telemetry QoS 0 có thể mất mẫu; không có bộ đệm lưu bù lúc offline. QoS 1 có thể giao lặp lệnh nên giữ nguyên các chốt chống lặp/hết hạn.

## 6. Discovery broker tùy chọn

Repo có client discovery trên ESP và responder tùy chọn trong `backend/discovery.py` cho chế độ LAN `MQTT_USE_TLS=0`. Cấu hình mẫu để discovery tắt; nếu bật cần tạo khóa cục bộ và đồng bộ với ESP. Nếu không có header khóa, firmware dùng MQTT_HOST IPv4 dự phòng. `MQTT_USE_TLS=1` tắt signed LAN discovery và dùng hostname cloud đã cấu hình.

ESP bind UDP 41885, broadcast query đến UDP 41884 khoảng 3 giây/lần khi mất MQTT. Query JSON đúng ba trường: v=1, kind=fire-alarm-discover, nonce=32 hex thường. Giới hạn query tham chiếu 512 byte.

Responder trả unicast từ UDP 41884, đúng sáu trường: v=1, kind=fire-alarm-broker, nonce, host (IPv4 chuẩn), port (nguyên 1–65535), mac (64 hex thường). Response tối đa 256 byte. Host phải là địa chỉ nguồn IPv4 được chọn theo tuyến trả về ESP, không lấy tùy ý từ adapter/VPN.

HMAC-SHA256 dùng **64 ký tự ASCII của khóa hex**, không decode thành 32 byte. Chuỗi ký chính xác, không có khoảng trắng hoặc newline:

```text
fire-alarm-broker|1|<nonce>|<host>|<port>
```

ESP yêu cầu nonce đang chờ, tuổi dưới 3000 ms, chỉ chấp nhận một lần; source UDP port=41884; IP nguồn=host đã ký; nguồn và ESP cùng subnet IPv4 riêng hợp lệ, không phải địa chỉ mạng/broadcast. Dải hỗ trợ: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16; subnet mask liên tục /30 hoặc rộng hơn. Không áp dụng cho 172.11.* hoặc IP công cộng.

Responder nên chỉ quảng bá khi chính phía nhận đã nối/đăng ký MQTT thành công, có giới hạn tốc độ và kích thước. Long tạo và giữ cặp khóa riêng qua kênh riêng tư, dùng cùng khóa trên server và các ESP; không tạo khóa khác cho từng bo. Không đưa khóa thật vào Git, tài liệu hoặc ví dụ.

Discovery không đổi Wi-Fi, không sửa config.h và không tự nạp chương trình. Mạng khách/hotspot cách ly, firewall hoặc VPN chọn sai tuyến có thể chặn UDP. Trong chế độ LAN, nếu không tìm được thì MQTT_HOST phải là IPv4 dự phòng đúng. HMAC discovery xác thực thông tin broker LAN, không mã hóa TCP MQTT trong chế độ đó; cloud TLS dùng đường kết nối riêng được mô tả ở mục 1 và [CLOUD_MQTT](CLOUD_MQTT.md).

[Về README](../README.md) · [Bàn giao](HANDOVER.md) · [Kiểm tra](TEST_STATUS.md)
