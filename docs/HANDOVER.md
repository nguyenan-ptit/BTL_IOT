# Bàn giao backend/API/MySQL và tích hợp nhóm — 07/11/2026

Repo hiện có firmware hai node, backend FastAPI/MySQL và frontend React dùng mock. Luồng ESP → EMQX Cloud → BE → MySQL đã được quan sát với node01/node02 trong buổi test local. Mã và kiểm thử phần Long đã có, nhưng quản trị tài khoản MQTT tự động trên deployment hiện tại, đăng nhập/frontend thực tế và deployment chung chưa hoàn tất.

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

- **Long:** cấu hình/kiểm chứng API quản trị broker tương thích, topic ACL và tài khoản riêng từng node; hoàn tất cấp/thu hồi/cấp lại trên broker thật. Deployment hiện tại chưa hỗ trợ adapter này: API báo incomplete và node vẫn bị chặn tại BE. Không tính thao tác xóa tài khoản thủ công là thu hồi tự động đã hoàn tất.
- **Vĩ:** dịch vụ đăng ký/đăng nhập người dùng, băm mật khẩu, JWT, trạng thái và vai trò tài khoản. BE của Long không có API tự đăng ký/đăng nhập; các user test có hash giả không thay thế dịch vụ này.
- **Long + Vĩ:** thống nhất users, houses.owner_id, room_users và các claim JWT user_id (int), role, exp; cùng khóa ký HS256. BE kiểm tra lại status/role/phạm vi DB. Khóa trao đổi riêng qua cấu hình runtime.
- **Nguyên + Long/Vĩ:** đối chiếu hợp đồng frontend mock (/api/nodes, /api/auth/*) với LONG_API và dịch vụ tài khoản, tích hợp response/token/mã lỗi rồi mới tắt mock. Trang backend/app/static/dashboard.html là trang thử API riêng.
- **An + Long:** đối chiếu MQTT username thực tế từng ESP với registry và policy; nạp username/mật khẩu mới khi cấp/cấp lại. Nghiệm thu ngưỡng, ACK, đầu ra vật lý và mất mạng/phục hồi theo từng node.
- **Nhóm:** triển khai BE, MySQL, broker, dịch vụ tài khoản và web với địa chỉ/HTTPS thống nhất. Hiện cấu hình chạy local 127.0.0.1:8000 chưa phải dịch vụ để thành viên khác truy cập.

Giữ chống trùng toàn bộ device_id + boot_id + seq, UTC và dữ liệu phòng lịch sử khi tích hợp. Dữ liệu mẫu test:true/prototype:true chưa được chuyển thành vận hành chính thức. Đăng ký node registered/pending chỉ lưu tham chiếu username, không tự tạo/xác nhận tài khoản EMQX; luồng xác nhận cấp thủ công cho node mới trên Serverless hiện chưa có.

Phần sự cố/thông báo phối hợp với Vĩ và giao diện với Nguyên. Lượt thử còi/đèn có thể đỏ/còi bật nhưng system_state vẫn normal/fault; không tạo sự cố cháy chỉ từ màu LED hoặc buzzer_cmd. Toàn bộ checklist Long vẫn chưa được đánh dấu hoàn thành khi còn các mục tích hợp/nghiệm thu nêu trên.

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

Repo công khai chỉ chứa cấu hình mẫu. config.h, mqtt_ca.h cục bộ, discovery_key.h, mật khẩu, khóa thật, database vận hành và binary nhúng cấu hình riêng không thuộc gói công khai. CA nhà cung cấp là chứng chỉ công khai, không phải private key. Long tự tạo cấu hình cục bộ; không dựa vào đường dẫn máy cá nhân của người bàn giao.

Firmware mặc định giữ MQTT TCP/IPv4 trong LAN và hỗ trợ cloud TLS 1.2 bằng lựa chọn `MQTT_USE_TLS=1`. Chế độ cloud kiểm tra hostname/chứng chỉ theo CA và thời gian SNTP, không tự chuyển sang TCP thường khi thất bại; signed discovery chỉ dành cho LAN. Long/người 3 tiếp tục thống nhất phân quyền lệnh, HTTPS/API và lưu dữ liệu bền vững; xem [CLOUD_MQTT](CLOUD_MQTT.md).

Các bộ native/build TLS không tự chứng minh hai node đã nghiệm thu. Bằng chứng nhận telemetry thật trong buổi test local là một mốc riêng, chưa xác nhận toàn bộ luồng cấp quyền/điều khiển/đầu ra. DNS/TCP/TLS handshake đồng bộ có thể làm chậm lấy mẫu; cần đo độ trễ, heap và kiểm tra lỗi chứng chỉ trên dịch vụ/thiết bị thật. Xem [TEST_STATUS](TEST_STATUS.md) cho firmware và [LONG_IMPLEMENTATION_STATUS](LONG_IMPLEMENTATION_STATUS.md) cho BE.
