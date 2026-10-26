# Ảnh phần cứng cần bổ sung

Cập nhật: **26/10/2026**. Thư mục này chưa có ảnh xác nhận hai node đã hoàn thiện. Không dùng ảnh cũ của một node để ghi là hai node, và không coi sơ đồ là bằng chứng đã lắp đúng.

Đề nghị chụp sau khi người phụ trách kiểm tra dây và ghi nhận phiên bản firmware thực tế:

| Tên tệp đề xuất | Nội dung cần nhìn rõ |
|---|---|
| `node01-overview.jpg` | Toàn bộ prototype node 1 và nhãn mã thiết bị |
| `node02-overview.jpg` | Toàn bộ prototype node 2 và nhãn mã thiết bị |
| `node01-wiring.jpg`, `node02-wiring.jpg` | Chân ESP, nhãn chân module và đường đi dây |
| `node01-flame-d1.jpg`, `node02-flame-d1.jpg` | Điểm lấy VCC phía Flame, điện trở 4,7 kΩ, điểm D1 và 47 kΩ xuống GND |
| `module-labels.jpg` | Mã module, chữ chân và thông tin nguồn, nếu có |

Ảnh cận bộ chia MQ-2 phải phân biệt AO → 47 kΩ → A0 và A0 → 10 kΩ → GND; ảnh DS18B20 phải thấy điện trở 4,7 kΩ từ DATA lên 3V3. Chụp mạch khi đã ngắt nguồn nếu cần di chuyển hoặc chỉnh dây để nhìn rõ.

Ghi chú kèm mỗi bộ ảnh: ngày chụp, mã node, bản firmware thực sự đã nạp và phần nào còn chờ kiểm thử. Nếu ảnh chụp trước V6, ghi rõ chưa có hoặc chưa xác nhận nhánh D1.

Trước khi đưa ảnh lên repository, che mật khẩu Wi-Fi, token, khóa, mã QR chứa thông tin kết nối và thông tin cá nhân trên nền ảnh. Không đưa ảnh chụp cấu hình bí mật hoặc Serial có thông tin xác thực vào đây.
