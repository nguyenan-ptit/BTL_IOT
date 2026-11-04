# Kết nối MQTT cloud

Firmware có hai chế độ: LAN IPv4/TCP mặc định và cloud qua hostname/TLS 1.2 khi bật `MQTT_USE_TLS`. Backend và database do Long triển khai; tạo broker cloud là một bước riêng của quá trình tích hợp.

## 1. Tạo broker EMQX Serverless

1. Đăng nhập EMQX Cloud Console bằng tài khoản của nhóm.
2. Tạo project nếu chưa có, rồi chọn **New Deployment → Serverless**.
3. Giữ **Spend Limit = 0** để chỉ dùng hạn mức miễn phí. Kiểm tra lại giá trị này trên màn hình xác nhận.
4. Đặt tên, ví dụ `iot-fire-alarm`, đọc điều khoản và tạo deployment. Chờ trạng thái **Running**.
5. Trong **Overview**, lấy hostname, cổng MQTT TLS và tải chứng chỉ CA được cung cấp. Hostname không có tiền tố `mqtts://`, đường dẫn hay phần `:port`.
6. Trong **Access Control → Authentication**, tạo tài khoản MQTT cho ESP và backend. Đây là tài khoản thiết bị, khác tài khoản đăng nhập trang quản lý. Giữ mật khẩu ngoài Git và trao đổi riêng.

Hạn mức và giao diện dịch vụ có thể thay đổi. Khi chuẩn bị tài liệu, EMQX công bố 1 triệu session-minute và 1 GB lưu lượng vào/ra miễn phí mỗi tháng. Hai ESP gửi mỗi 2 giây và một backend nhận ước tính dùng khoảng 0,24 GB payload trong 36 giờ; chưa tính overhead và kết nối phụ. Chạy liên tục cả tháng có thể vượt hạn mức lưu lượng.

Nguồn chính thức: [tạo Serverless](https://docs.emqx.com/en/cloud/latest/create/serverless.html), [giá và Spend Limit](https://docs.emqx.com/en/cloud/latest/price/pricing.html).

## 2. Cấu hình từng ESP

Giữ toàn bộ `firmware/node_full/`. Tại máy nạp, tạo `config.h` từ `config.example.h` nếu chưa có và cập nhật các trường sau bằng giá trị thực tế:

```cpp
#define MQTT_USE_TLS 1
constexpr char MQTT_HOST[] = "hostname-trong-overview.example.com";
constexpr uint16_t MQTT_PORT = 8883; // Dùng cổng thực tế trong Overview.
constexpr char MQTT_USERNAME[] = "tai-khoan-mqtt-da-tao";
constexpr char MQTT_PASSWORD[] = "mat-khau-mqtt-rieng";
constexpr char DEVICE_ID[] = "node01";
constexpr char ROOM_ID[] = "101";
```

Đây là ví dụ, chưa phải thông tin kết nối hoạt động. Điền Wi-Fi 2,4 GHz có Internet ở nơi đặt ESP. Mỗi bo dùng ID riêng; node thứ hai dự kiến `node02` / `102`.

Tạo `mqtt_ca.h` từ `mqtt_ca.example.h`, rồi thay placeholder trong `MQTT_TLS_CA_CERT` bằng PEM CA tải từ nhà cung cấp, gồm cả dòng `BEGIN CERTIFICATE` và `END CERTIFICATE`. CA là chứng chỉ công khai; không dán private key hay mật khẩu vào trường này. Hai file cấu hình cục bộ đều được `.gitignore` bỏ qua.

Firmware sẽ:

- Kết nối bằng hostname để dùng DNS, SNI và kiểm tra tên trong chứng chỉ.
- Xác minh CA và hạn chứng chỉ; chờ đồng bộ giờ SNTP qua Internet trước khi kết nối TLS.
- Tắt discovery LAN trong chế độ cloud. Thiếu/sai CA hoặc hostname thì không bật kết nối cloud; cảm biến/đầu ra cục bộ vẫn được khởi tạo.
- Giữ nguyên topic, JSON và quy tắc ACK trong [MQTT_CONTRACT](MQTT_CONTRACT.md).

Cấu hình cũ không có `MQTT_USE_TLS`, hoặc đặt giá trị `0`, tiếp tục dùng LAN IPv4/TCP và discovery LAN như trước. Đổi chế độ cần biên dịch và nạp lại từng bo.

## 3. Kết nối phía Long

Backend dùng cùng hostname, cổng TLS và CA của broker, với tài khoản MQTT phù hợp. Đăng ký `iot/devices/+/telemetry`; cấu hình quyền publish/subscribe theo vai trò và các topic trong hợp đồng. Mỗi MQTT client phải có client ID riêng để tránh ngắt kết nối lẫn nhau.

Trước khi viết phần lưu DB, dùng một MQTT client có xác minh TLS để nhận telemetry thật từ một ESP. Sau đó mới nối luồng receiver → database → HTTP API → frontend. Tạo broker chưa triển khai các thành phần backend/database/API này.

## 4. Kiểm tra trước khi nghiệm thu

- Nhận telemetry mới của từng bo, xác nhận ID/phòng và phiên bản JSON.
- Sai mật khẩu bị từ chối; sai CA hoặc sai hostname bị TLS từ chối. Không tắt xác minh chứng chỉ để làm phép thử thành công.
- Mạng/NTP chưa sẵn sàng không gây vòng chờ chủ động trong code; theo dõi log Serial để phân biệt chờ giờ, lỗi TLS và lỗi tài khoản.
- Mất mạng rồi nối lại: ESP đăng ký lại các topic điều khiển, backend xử lý offline/online bằng dữ liệu mới hợp lệ.
- Chỉnh ngưỡng và thử đầu ra: kiểm tra ACK theo boot/request/revision/command_seq, đồng thời quan sát phần cứng riêng.
- Đo heap và khoảng cách giữa các lần đọc cảm biến khi DNS/TCP/TLS kết nối hoặc thất bại. ESP8266 vẫn thực hiện handshake đồng bộ, có thể làm trễ vòng lặp; việc biên dịch đạt chưa xác nhận độ trễ này phù hợp trên mạch thật.

Hiện đã có kiểm tra native và biên dịch với cấu hình mô phỏng; cần broker thật, CA thực tế và từng ESP để hoàn tất các mục trên. Chứng chỉ công khai dùng để biên dịch thử không thay thế CA của deployment.

[Về README](../README.md) · [Bàn giao](HANDOVER.md) · [Bằng chứng kiểm tra](TEST_STATUS.md)
