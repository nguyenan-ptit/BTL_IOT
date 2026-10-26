# Kịch bản nghiệm thu phần cứng hai node

Ngày chuẩn bị 26/10/2026. Đây là các bài cần thực hiện tiếp; ô kết quả chưa có bằng chứng cho cả hai board. Tách rõ số đo thật, thử logic và dữ liệu mô phỏng.

| Mã | Ca kiểm tra | Tiêu chí quan sát / giới hạn | Node 1 | Node 2 |
|---|---|---|---|---|
| HW01 | ESP trần và USB | Nhận COM ổn định, sketch USB in số giây tăng; không cảnh báo quá dòng | Chưa thử | Chưa thử |
| HW02 | Đối chiếu dây và nguồn khi đã ngắt điện | Đúng bảng chân, điện trở, GND chung; A0 chỉ MQ, D0 chỉ Flame, D1 chỉ nhánh nguồn | Chưa thử | Chưa thử |
| HW03 | DS18B20 | Firmware tổng báo health=ok và nhiệt độ hợp lý; so với nhiệt kế nếu có. Chưa có đối chiếu thì không khẳng định sai số | Chưa thử | Chưa thử |
| HW04 | DS18B20 không gắn khi khởi động | Chuẩn bị dây khi không điện; firmware báo thiếu dữ liệu/vàng nếu không có cảnh báo khác; không gửi nhiệt độ cũ như mới | Chưa thử | Chưa thử |
| HW05 | MQ-2 AO | Có ADC 0..1023 qua47k/10k; chờ phần mềm 300 s. ADC=0 không tự coi là lỗi hay khí sạch; xác nhận nguồn/bộ nung riêng | Chưa thử | Chưa thử |
| HW06 | Flame chưa cấp nguồn tại điểm đo khi khởi động | Chuẩn bị mất nguồn cả VCC và nhánh đo khi đã ngắt điện; D1=0, DO=null, health=power_missing; vàng nếu không cảnh báo khác | Chưa thử | Chưa thử |
| HW07 | Flame có nguồn | D1=1 sau 300 ms, sau đó lọc DO 100 ms; trạng thái có nguồn không chứng minh đúng điện áp cho model hay đầu thu quang tốt | Chưa thử | Chưa thử |
| HW08 | RGB/còi khi mọi health=ok, không alarm | Xanh liên tục, còi nghỉ. Nếu OFF vẫn kêu, kiểm tra module/đấu dây/mức nghỉ, không coi lệnh phần mềm là quan sát thật | Chưa thử | Chưa thử |
| HW09 | Báo lỗi/chờ dữ liệu | Vàng và hiện đúng cảm biến lỗi khi không alarm. Màu vàng là đỏ+xanh của RGB âm chung; B không nối | Chưa thử | Chưa thử |
| HW10 | Kiểm thử cảnh báo và ngưỡng | 31 kiểm tra tại thời điểm biên dịch đạt với cờ; nếu cần nghe/nhìn thật, dùng chế độ/ngưỡng thử được ghi rõ TEST sau khi kiểm tra nguồn, không tạo lửa/rò khí | Chưa thử | Chưa thử |
| HW11 | Mất Wi-Fi/broker | Khi cảm biến vẫn được cấp đúng, ESP tiếp tục vòng đọc và điều khiển tại chỗ; backend nhận ra mất dữ liệu theo chính sách đã thống nhất | Chưa thử | Chưa thử |
| HW12 | Khôi phục mạng | Tự kết nối lại, backend nhận mẫu mới đúng ID; không khẳng định có lưu bù vì firmware chưa có hàng đợi bền vững | Chưa thử | Chưa thử |
| HW13 | Cấp điện lại | Firmware tự chạy, health khởi tạo được báo, MQ chờ 300 s lại; cảnh báo không được lưu bền qua mất điện ESP | Chưa thử | Chưa thử |
| HW14 | Hai node cùng hoạt động | ID MQTT/client/device khác nhau, ánh xạ phòng đã thống nhất, dữ liệu không đè nhau; quan sát riêng LED/còi từng node | Chưa thử | Chưa thử |

Phần mềm có kiểm tra tự động cho alarm đã xác nhận được giữ qua lỗi nguồn Flame trong cùng lượt chạy. Chưa có bằng chứng tình huống này đã được quan sát trên mạch thật. Không rút/cắm nóng VCC để tạo bài thử; dùng bộ thử phần mềm, hoặc chuẩn bị bài đo có công tắc/thiết bị phù hợp sau khi nhóm xác nhận an toàn nguồn.

Mỗi kết quả thực tế cần ngày, người thử, ID/board, phiên bản firmware, mô tả mạch, ảnh/log và kết quả. Chỉ đánh dấu Đạt sau khi có bằng chứng; ảnh/log không chứa mật khẩu, token hay dữ liệu cá nhân.
