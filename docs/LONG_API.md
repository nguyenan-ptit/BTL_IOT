# API dữ liệu, điều khiển và vòng đời thiết bị

Hợp đồng cho phần việc của Long, ngày 06/11/2026. Xem [cách chạy backend](../backend/README.md), [database/migration](../database/README.md) và [bằng chứng kiểm thử](LONG_IMPLEMENTATION_STATUS.md). Tài liệu này mô tả mã đã triển khai; khả năng của deployment EMQX thật phải được kiểm tra riêng.

## Xác thực và quyền

Mọi API dữ liệu/quản lý/điều khiển yêu cầu `Authorization: Bearer <token>`. Dịch vụ tài khoản của người 3 ký HS256 bằng `JWT_SECRET` dùng chung, ít nhất 32 ký tự. Token có `user_id` số nguyên dương, `role` và `exp`; backend đối chiếu lại user/role/status trong MySQL. Không có endpoint tự đăng nhập hoặc tự cấp token ở phần này.

| Người gọi | Đọc | Quản lý/điều khiển |
|---|---|---|
| admin | Tất cả thiết bị/phòng | Có |
| owner | Phòng trong houses do mình sở hữu | Cùng phạm vi |
| tenant | Phòng có room_users đang hiệu lực | Không |

Lịch sử telemetry/lệnh lọc theo phòng **đã ghi trong bản ghi**, không theo phòng hiện tại của node. Sau khi chuyển phòng, người quản lý phòng mới không được đọc telemetry/lệnh phòng cũ. Danh sách và chi tiết hiện tại dùng phòng hiện tại. Truy vấn lịch sử ngoài phạm vi trả danh sách rỗng; truy cập chi tiết/điều khiển ngoài phạm vi trả `403`.

`GET /api/health`, `/`, `/docs` và OpenAPI không yêu cầu token. Health chỉ là trạng thái receiver, không chứng minh thiết bị/phần cứng đang hoạt động.

## Endpoint

| Method | Đường dẫn | Nội dung |
|---|---|---|
| GET | `/api/devices` | Registry + dữ liệu mới nhất trong phòng hiện tại; có node chưa từng gửi dữ liệu |
| POST | `/api/devices/register` | Đăng ký trong phòng có quyền; trả `201`, registered/pending |
| GET | `/api/devices/{id}` | Metadata, phiên bản, last_seen_at, vòng đời và kết quả đồng bộ MQTT |
| PATCH | `/api/devices/{id}` | device_name, board_model, hardware_version, firmware_version, mqtt_client_id |
| PATCH | `/api/devices/{id}/room` | `{"room_id":"102"}`; kiểm tra cả phòng nguồn và đích, ghi audit |
| PATCH | `/api/devices/{id}/lifecycle` | Vòng đời/ghi chú; kích hoạt lần đầu cần synced; mở lại sau tạm dừng có kiểm tra nhật ký |
| GET | `/api/history?device_id={id}&limit=20&from=...&to=...` | Telemetry có lọc thời gian và quyền phòng lịch sử |
| POST | `/api/devices/{id}/thresholds` | Gửi ngưỡng, trả `202` pending hoặc kết quả không cần gửi |
| POST | `/api/devices/{id}/buzzer-test` | Thử/dừng còi và LED, trả `202` |
| GET | `/api/devices/{id}/commands?limit=20` | Lịch sử điều khiển bền vững, lọc phòng đã ghi |
| POST | `/api/devices/{id}/mqtt-credentials` | provision/revoke/reissue, có bản ghi thao tác |
| GET | `/api/devices/{id}/mqtt-operations/{operation_id}` | Kết quả từng bước và mã lỗi an toàn |
| POST | `/api/devices/{id}/mqtt-operations/{operation_id}/retry` | Thử lại cùng thao tác; cấp/cấp lại phải gửi cùng mật khẩu ban đầu |
| GET | `/api/admin/mqtt-capabilities` | admin kiểm tra đọc API quản trị; không tiết lộ khóa |

ID thiết bị có 1–32 ký tự chữ, số, `_`, `-`. Đăng ký hiện vẫn bắt buộc room_id; luồng QTV đăng ký chưa gán phòng rồi chủ trọ nhận cần thống nhất riêng, chưa được giả định là đã có.

Ví dụ đăng ký:

```json
{"device_id":"node03","device_name":"Cảm biến phòng 103","room_id":"103","mqtt_username":"node03-reference","mqtt_client_id":"esp-chip-123","hardware_version":"r1","firmware_version":"v6"}
```

`mqtt_username` lúc đăng ký là tham chiếu, không phải bằng chứng tài khoản đã được tạo trên broker. Khi cấp qua API, backend tạo username riêng theo node và mã thao tác, rồi trả về `target_username`. Người nạp ESP phải dùng username này và mật khẩu đã cung cấp. Client ID được lưu riêng; thu hồi tìm các phiên bằng **username thực tế trên broker**, rồi dùng Client ID trả về từ broker, không giả định Client ID trùng device_id.

Mẫu một phần response danh sách:

```json
{"items":[{"device_id":"node03","room_id":"103","lifecycle_status":"registered","credential_status":"pending","data":null,"online":false,"connectivity":"offline","sensors":[],"can_control":false,"device":{"hardware_version":"r1","firmware_version":"v6","last_seen_at":null,"mqtt_sync_status":"unknown"}}]}
```

`device` thực tế có thêm các trường registry. `lifecycle_status`, `credential_status`, `connectivity` và `sensors` là thông tin riêng. `data=null` cũng xảy ra sau khi chuyển phòng nhưng chưa có telemetry ở phòng mới. Không dùng nhãn `room` trong payload ESP thay cho `room_id` registry để phân quyền.

## Lịch sử và điều khiển

`from`/`to` là ISO 8601 có múi giờ, giới hạn gồm hai đầu mút, độ chính xác giây; thiếu múi giờ, định dạng sai hoặc from > to trả `422`. Dấu `+` trong URL phải mã hóa `%2B`. Timestamp trả UTC `+00:00`. Kết quả mới nhất trước, limit 1–100; chưa có phân trang vượt 100 mẫu.

Hai POST điều khiển cần thêm `X-IoT-Request: 1`, JSON và cùng Origin nếu có header Origin. Các giá trị expected lấy từ telemetry mới nhất, không tự đoán:

```json
{"expected_boot_id":"0123456789abcdef","expected_revision":0,"thresholds":{"mq2_on":650,"mq2_off":550,"temperature_on_c":65.0,"temperature_off_c":60.0}}
```

```json
{"expected_boot_id":"0123456789abcdef","expected_seq":0,"action":"start"}
```

`action=stop` chỉ dừng lượt thử, không tắt cảnh báo thật. Node phải active/active, đúng quyền, online, có firmware phù hợp và MQTT backend đang kết nối. Kiểm tra trạng thái được thực hiện lại dưới khóa dòng ngay trước publish.

| Trạng thái lệnh | Ý nghĩa |
|---|---|
| queued | Đã ghi DB, chưa xác nhận gửi |
| pending | MQTT nhận yêu cầu publish; chưa có kết quả ESP |
| unconfirmed | Lỗi vận chuyển khiến việc gửi chưa rõ; có thể ESP đã nhận, chờ ACK/timeout |
| running | ESP xác nhận đang thử đầu ra |
| applied/completed/stopped | ESP xác nhận kết quả tương ứng, hoặc không cần gửi vì trạng thái đã đúng |
| blocked/interrupted/superseded | Cảnh báo ưu tiên, restart/chuyển phòng hoặc cấu hình/lượt lệnh đã đổi |
| timeout | Chưa xác nhận kết quả trước hạn |
| failed | Yêu cầu bị từ chối trước khi dispatch |

Không tự phát lại lệnh vật lý khi lỗi/restart. Worker xử lý ACK/timeout mỗi giây độc lập với lượt gọi dashboard. Khi restart, dòng chưa hoàn tất được đóng timeout/interrupted; lịch sử cũ vẫn truy vấn được. ACK hợp lệ tới chậm vẫn có thể xác nhận lệnh đang được theo dõi trong RAM. Lệnh của phòng cũ bị ngắt theo dõi khi chuyển phòng. Response giữ bằng chứng ACK liên quan, không chép toàn bộ telemetry phòng mới vào lịch sử lệnh cũ.

## Cấp/thu hồi/cấp lại MQTT

API không cho đặt `credential_status=active` hoặc `pending` bằng PATCH vòng đời. Chỉ kết quả thao tác broker mới đưa credential về active. Thu hồi qua PATCH revoked/decommissioned dùng cùng dịch vụ MQTT, không chỉ cập nhật MySQL.

```json
{"action":"provision","password":"<mật khẩu mới 16–128 ký tự>"}
```

```json
{"action":"revoke"}
```

```json
{"action":"reissue","password":"<mật khẩu mới 16–128 ký tự>"}
```

Mỗi lần cấp/cấp lại dùng username mới; retry cùng operation_id tái sử dụng đúng username đó và yêu cầu đúng mật khẩu ban đầu. Không trả lại mật khẩu, không lưu mật khẩu thuần và không ghi khóa quản trị vào response/log. Người gọi giữ mật khẩu để chuyển riêng cho người 1 và để retry. Backend chỉ lưu PBKDF2 digest có salt từ mã thao tác.

Luồng cấp: chặn backend → kiểm tra khả năng/quyền đọc/policy → đặt ACL deny trên tài khoản mới → tạo/cập nhật tài khoản không có superuser → thu hồi tài khoản cũ đã xác minh nếu có → cấp đúng ba topic riêng của node và deny các topic khác → ngắt phiên cần thiết → ghi synced/credential active/lifecycle provisioned. Người 1 nạp cấu hình và kiểm tra ESP, sau đó mới PATCH lifecycle active.

Luồng thu hồi: commit credential revoked và lifecycle blocked/decommissioned **trước** mọi yêu cầu HTTP → deny topic → xóa tài khoản → tra username và ngắt từng Client ID liên quan → kiểm tra không còn phiên → ghi kết quả. Chỉ disconnect mà không xóa tài khoản không được coi là thu hồi.

Tạm blocked/maintenance chỉ chặn hoạt động backend, giữ thông tin MQTT để có thể mở lại theo vòng đời. Thu hồi/cấp lại là thao tác khác. decommissioned không thể mở/cấp lại; vẫn cho phép retry thu hồi chưa hoàn tất.

### Khóa/mở lại và bảo trì tại backend

Dùng `PATCH /api/devices/{id}/lifecycle` với một trong các body:

```json
{"lifecycle_status":"blocked"}
```

```json
{"lifecycle_status":"maintenance","maintenance_note":"Bảo trì cảm biến"}
```

```json
{"lifecycle_status":"active"}
```

Khóa/bảo trì ngừng ghi telemetry và chặn lệnh điều khiển mới; các lệnh đang chờ được ghi interrupted, không phát thêm lệnh vật lý để hủy. Bản tin/lệnh đã tới ESP không bị thu hồi bởi việc đổi trạng thái tại BE. Tài khoản/quyền/phiên MQTT, credential_status và mqtt_sync_status được giữ nguyên. Mở lại nhận các bản tin mới, không khôi phục các bản tin đã bị từ chối trong lúc tạm dừng.

Với node đang active/active nhưng mqtt_sync_status=unknown (ví dụ node demo hoặc tài khoản đã được cấu hình ngoài BE), BE lưu thông tin MQTT trong audit khi tạm dừng. Có thể mở lại nếu chuỗi nhật ký từ lần active gần nhất xác nhận việc tạm dừng và MQTT username/credential/operation không đổi. Nhật ký nằm trong DB nên không phụ thuộc phiên trình duyệt hay bộ nhớ backend. Sửa ghi chú trong lúc bảo trì không làm mất khả năng mở lại. mqtt_sync_status vẫn là unknown, không bị đổi thành synced.

Kích hoạt lần đầu vẫn cần credential active và synced. Node pending/revoked, thao tác MQTT pending/failed, tài khoản MQTT đã đổi, hoặc thiếu nhật ký tạm dừng phù hợp sẽ nhận 409. Không dùng PATCH active để bỏ qua thao tác thu hồi dở dang. Chỉ admin/owner đúng phạm vi được đổi trạng thái; tenant nhận 403. Response thành công trả 200 cùng device_id, lifecycle_status, credential_status và mqtt_sync_status.

Kịch bản tự kiểm thử bằng Swagger và Workbench: [BE_LIFECYCLE_TEST](BE_LIFECYCLE_TEST.md).

```json
{"operation_id":"0123456789abcdef0123456789abcdef","action":"revoke","status":"incomplete","steps":{"backend_blocked":"succeeded","capabilities":"failed"},"error_code":"emqx_http_403","message":"Chưa hoàn tất tại EMQX; backend vẫn chặn node. Có thể thử lại."}
```

Response thực tế thêm device_id, phòng/người yêu cầu, username, thời gian và các bước đã chạy. `200 + succeeded` chỉ khi các yêu cầu cần thiết hoàn tất; `202 + incomplete` yêu cầu hiển thị **chưa hoàn tất tại EMQX**, không dùng thông báo thành công chung. Retry `{}` cho revoke, hoặc `{"password":"<mật khẩu ban đầu>"}` cho cấp/cấp lại. Thao tác cũ đã bị thay thế trả `409` và không thể cấp quyền trở lại.

Nếu tiến trình dừng giữa các bước, bản ghi processing và trạng thái chặn đã tồn tại trong DB. Retry đọc lại, thực hiện lại các bước idempotent và kiểm tra kết quả. Mất DB sau tác động broker có thể để trạng thái processing; không tự kích hoạt node. Kết quả từng lần chạy được audit; các bước dở lúc crash phải được kiểm tra lại bằng retry.

## Cấu hình và xác minh deployment EMQX

Adapter hỗ trợ API v5 dùng authentication và authorization built-in, username làm định danh. Cấu hình ví dụ, **không chứa bí mật**:

```json
{"emqx_admin":{"deployment":"emqx5","base_url":"https://<deployment-api-prefix>/api/v5","api_key":"","api_secret":"","policy_verified":false,"legacy_node_usernames":{"node01":"<username cũ đã đối chiếu>"},"timeout_s":5}}
```

URL phải là API base của deployment, gồm prefix và `/api/v5`, không phải hostname MQTT/cổng 8883 hoặc URL console. Dùng HTTPS với CA tin cậy; HTTP chỉ cho loopback. `ca_file` tùy chọn cho CA quản trị riêng. Không tắt xác minh TLS hoặc tự đi theo redirect mang khóa.

Trước khi đặt `policy_verified=true`, quản trị viên kiểm tra trên deployment:

1. Authenticator built-in theo username là nguồn xác thực áp dụng cho các tài khoản node; không có anonymous/nguồn khác tiếp tục chấp nhận thông tin đã xóa.
2. Built-in authorization được áp dụng, không có nguồn cho phép đứng trước; mặc định deny khi không khớp. Không có Client ID ACL vượt quyền username. Backend riêng được cấp subscribe telemetry/publish lệnh cần thiết.
3. Khóa API quản trị đọc/ghi được tài khoản built-in, ACL username và quản lý phiên. Endpoint capabilities chỉ xác minh **quyền đọc**, không suy ra quyền ghi. Cấp/thu hồi node thử riêng và kiểm tra kết quả ghi để xác minh quyền thực tế.
4. Thiết bị cũ được đối chiếu username với registry và danh sách phiên. Chỉ thêm username đã xác minh vào legacy_node_usernames cho đúng device_id. Backend từ chối sửa/xóa tài khoản MQTT của chính backend và từ chối username cũ chưa có bằng chứng thuộc node; owner không thể đăng ký một username tùy ý để xóa tài khoản broker khác.

`legacy_node_usernames` là cấu hình quản trị local, không nhận từ frontend. Tài khoản mới do thao tác backend tạo đã có liên kết bền vững trong mqtt_operations. Với username tham chiếu chưa xác minh, backend kiểm tra tài khoản và phiên hiện hữu: nếu đã tồn tại thì dừng và yêu cầu đối chiếu mapping; nếu chưa tồn tại và không có phiên, việc thu hồi idempotent không xóa tài khoản khác đang dùng.

Đối chiếu [API Dedicated/Flex](https://docs.emqx.com/en/cloud/latest/api/dedicated.html) và [API Serverless](https://docs.emqx.com/en/cloud/latest/api/serverless.html). Tài liệu Serverless hiện chỉ liệt kê clients/subscriptions/publish, chưa công bố API quản lý credential/ACL cần cho luồng này; chế độ serverless trả unsupported, giữ chặn backend và không tuyên bố tự động thu hồi đã hoàn tất. Nhóm cần thao tác console thủ công có biên bản hoặc chọn deployment/API hỗ trợ; không sử dụng API console riêng không được công bố.

## Mã lỗi và nghiệm thu phối hợp

| HTTP | Xử lý ở giao diện |
|---|---|
| 401 | Yêu cầu đăng nhập lại; token thiếu/hết hạn, tài khoản locked hoặc role đã đổi |
| 403 | Không đủ vai trò/phạm vi phòng hoặc Origin/header không hợp lệ |
| 404 | Thiết bị/phòng/thao tác không tồn tại, hoặc chưa có telemetry để điều khiển |
| 409 | Trạng thái/xung đột/định danh trùng; tải lại dữ liệu và xử lý thao tác đang dở |
| 422 | Body/thời gian/mật khẩu retry không hợp lệ; sửa đầu vào |
| 503 | DB/MQTT/cấu hình xác thực chưa sẵn sàng; không hiển thị lệnh đã thực hiện |
| 202 + incomplete | Backend đã chặn, EMQX chưa hoàn tất; hiển thị bước lỗi và nút retry |

Người 3 cung cấp token từ đăng nhập thật và kiểm tra locked/role/phạm vi với tài khoản thật. Người 4 tích hợp endpoint và trạng thái ở trên; frontend mock hiện có chưa phải bằng chứng đã nối backend. Người 1 nạp username/password mới, kiểm tra telemetry và xác nhận đầu ra vật lý.

Nghiệm thu broker thật phải chứng minh: node không publish/subscribe topic node khác, phiên cũ bị ngắt, mật khẩu/username cũ không kết nối lại được, EMQX lỗi không báo thành công chung, retry không tạo tài khoản trùng và cấp lại giữ device_id/history. Nghiệm thu ESP phải có ACK ngưỡng, timeout, thử/dừng còi và LED; kết quả phần mềm không thay tiếng còi/đèn thực tế.
