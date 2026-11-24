# Bàn giao backend/API/MySQL và tích hợp nhóm

Repo có firmware ESP8266, backend FastAPI/MySQL và frontend React gọi API để đăng nhập, xem dữ liệu và quản lý thiết bị. Luồng ESP → EMQX Cloud → BE → MySQL đã được quan sát với node01/node02 trong buổi test local. Các kết quả kiểm thử bên dưới thuộc mốc bàn giao tháng 11/2026.

Người nhận bắt đầu từ [RUN_BACKEND_WINDOWS](RUN_BACKEND_WINDOWS.md). [HANDOVER_SUMMARY](HANDOVER_SUMMARY.md) là bản ngắn có thể gửi nhóm; [LONG_IMPLEMENTATION_STATUS](LONG_IMPLEMENTATION_STATUS.md) phân biệt code, kiểm thử và việc còn thiếu. Không dùng tài liệu P1/SQLite lịch sử làm hướng dẫn chạy BE hiện tại.

## Mã và tài liệu bàn giao

1. [README](../README.md), firmware mẫu và [CLOUD_MQTT](CLOUD_MQTT.md). Cấu hình ESP thật nằm cục bộ: tạo `config.h` từ [config.example.h](../firmware/node_full/config.example.h); CA ESP ở `mqtt_ca.h`.
2. [MQTT_CONTRACT](MQTT_CONTRACT.md): topic, schema, kiểu/null, đơn vị, ACK, heartbeat/reconnect và discovery.
3. `backend/`: FastAPI/Paho subscriber, validation schema 6, MySQL storage, JWT adapter, API quản lý/điều khiển, journal ACK/timeout và dashboard thử API. Xem [hướng dẫn backend](../backend/README.md).
4. `database/`: init.sql là schema MySQL chuẩn, migration 20261106_01 và dữ liệu demo/test tùy chọn. Không có DB vận hành trong repo.
5. [examples](../examples/README.md) là JSON mô phỏng; [TEST_STATUS](TEST_STATUS.md) ghi riêng bằng chứng phần mềm và kiểm tra thật.

Thông tin Cloud và settings.local.json không nằm trong Git. Người nhận tự điền host/cổng, tài khoản BE, CA và MySQL của môi trường mình. Cổng MySQL 13317, datadir test và đường dẫn CA ở máy bàn giao không tự xuất hiện trên máy clone repo. Không đưa mật khẩu hoặc JWT vào chat nhóm/commit.

## Phần đã có và bằng chứng

- Trong buổi test local đã có telemetry thật node01/node02 qua EMQX Cloud và history MySQL. Đồng thời đã gửi một payload MQTTX có boot_id/seq riêng và tìm được đúng bản ghi; dữ liệu mới nhất có thể là bản tin ESP khác, không phải bản vừa gửi tay.
- API đã có registry, metadata, gán/chuyển phòng, lọc lịch sử theo thời gian, JWT/room scope, lịch sử điều khiển, audit và journal thao tác MQTT. Đã test thủ công một số API bằng tài khoản fixture 1001/1002/1003.
- PATCH lifecycle hỗ trợ active → blocked → active và active → maintenance → active. Trường hợp mqtt_sync_status=unknown cần nhật ký tạm dừng khớp cùng thông tin MQTT; không đánh dấu synced. Node pending/revoked hoặc đang có lỗi MQTT vẫn bị chặn.
- 45/45 ca cô lập và 9/9 ca lifecycle trên MySQL riêng đạt sau sửa. Bộ MySQL/migration đầy đủ ở mốc 06/11 đạt 36/36; đó là mốc trước sửa lifecycle. Broker và token trong các bộ tự động là fixture.
- Chưa xác nhận đầy đủ ACK/timeout/reconnect và còi/LED thật của cả hai bo. Health connected chỉ phản ánh kết nối/subscription của BE, không xác nhận ACL hay quyền quản trị broker.

## Phân công tích hợp và phần còn thiếu

- **Nguyễn Văn An:** phụ trách phần cứng, firmware ESP8266 và cập nhật firmware qua mạng (FOTA). Cấu hình kết nối MQTT trên từng node, nghiệm thu ngưỡng, ACK, còi, LED và khả năng phục hồi kết nối.
- **Đặng Kỳ Vĩ:** phụ trách backend, đăng nhập, xác thực, JWT và quản lý trạng thái, vai trò người dùng.
- **Vũ Thành Nguyên:** phụ trách frontend React, tích hợp API, luồng đăng nhập và cơ sở dữ liệu MySQL. Xem [hướng dẫn frontend](../frontend/README.md).
- **Nhóm:** thống nhất địa chỉ truy cập frontend, backend, MySQL và broker khi triển khai. Xem [hướng dẫn FOTA](OTA_CONTRACT.md) để cấu hình HTTPS cho endpoint tải firmware.

Giữ chống trùng toàn bộ device_id + boot_id + seq, UTC và dữ liệu phòng lịch sử khi tích hợp. Dữ liệu mẫu test:true/prototype:true chưa được chuyển thành vận hành chính thức. Đăng ký node registered/pending chỉ lưu tham chiếu username, không tự tạo/xác nhận tài khoản EMQX; luồng xác nhận cấp thủ công cho node mới trên Serverless hiện chưa có.

Nghiệm thu quản trị broker cần đối chiếu API, ACL và tài khoản MQTT riêng của từng node. Bản triển khai thiếu API quản trị tương thích trả `incomplete` và backend giữ node ở trạng thái bị chặn khi đã bắt đầu thu hồi. Với luồng sự cố, xác nhận `system_state` trước khi ghi nhận cảnh báo. Lượt thử đầu ra có thể bật LED đỏ và còi trong trạng thái `normal` hoặc `fault`.

## Nghiệm thu chung trước khi tích hợp

| Ca | Cần ghi lại theo từng node |
| --- | --- |
| Nhận dạng/telemetry | ID, phòng, marker Serial, thời gian, topic và bản tin mới thực tế. |
| Mất mạng/phục hồi | Quá hạn offline phía nhận, ESP nối lại/đăng ký lại và có telemetry mới. |
| Ngưỡng | ACK đúng request/revision/giá trị; khởi động lại còn ngưỡng đã lưu. |
| Thử đầu ra | Còi và LED đỏ nhấp nháy khoảng 3 giây; stop/hết giờ trở về cảm biến; ghi quan sát vật lý riêng. |
| Ưu tiên cảnh báo | Cảnh báo thật được giữ khi dừng thử hoặc một cảm biến bị lỗi; không dùng lửa/rò khí thật để thử phần mềm. |
| Lỗi cảm biến | Đối chiếu null/health và sơ đồ; MQ-2 hiện chưa chẩn đoán đầy đủ mất nguồn/đứt AO. |

Đưa dữ liệu mô phỏng vào broker và database thử. Khi nghiệm thu, ghi riêng phản hồi của ESP và kết quả quan sát âm thanh, đèn, dây và nguồn trên mạch thật.

## Công khai và bảo mật

Repo công khai chỉ chứa cấu hình mẫu. config.h, mqtt_ca.h cục bộ, discovery_key.h, mật khẩu, khóa thật, database vận hành và binary nhúng cấu hình riêng không thuộc gói công khai. Mỗi thành viên tạo cấu hình cục bộ theo môi trường của mình.

Firmware mặc định giữ MQTT TCP/IPv4 trong LAN và hỗ trợ cloud TLS 1.2 bằng lựa chọn `MQTT_USE_TLS=1`. Chế độ cloud kiểm tra hostname/chứng chỉ theo CA và thời gian SNTP, không tự chuyển sang TCP thường khi thất bại; signed discovery chỉ dành cho LAN. Xem [hướng dẫn MQTT qua TLS](CLOUD_MQTT.md).

Các bộ native/build TLS không tự chứng minh hai node đã nghiệm thu. Bằng chứng nhận telemetry thật trong buổi test local là một mốc riêng, chưa xác nhận toàn bộ luồng cấp quyền/điều khiển/đầu ra. DNS/TCP/TLS handshake đồng bộ có thể làm chậm lấy mẫu; cần đo độ trễ, heap và kiểm tra lỗi chứng chỉ trên dịch vụ/thiết bị thật. Xem [TEST_STATUS](TEST_STATUS.md) cho firmware và [LONG_IMPLEMENTATION_STATUS](LONG_IMPLEMENTATION_STATUS.md) cho BE.
