# Test khóa/mở lại và bảo trì tại BE

Kịch bản này dùng node01 đã active/active, thông tin MQTT vẫn dùng được; node02 tiếp tục gửi để đối chiếu. Nếu node01 đang revoked hoặc mqtt_sync_status là pending/failed, không dùng kịch bản này để bỏ qua thao tác MQTT dở dang. API dưới đây không xóa tài khoản hay ngắt ESP trên EMQX.

## 1. Nạp code mới

Trong cửa sổ CMD đang chạy BE, nhấn Ctrl+C, đợi dừng hoàn toàn rồi chạy lại từ thư mục dự án:

```bat
.venv\Scripts\python.exe -m uvicorn app:app --app-dir backend --host 127.0.0.1 --port 8000 --workers 1
```

Giữ JWT_SECRET giống phiên trước. Nếu dùng CMD mới, cần đặt lại biến này trước khi chạy BE. Không mở thêm worker/backend thứ hai trên cùng DB.

Mở http://127.0.0.1:8000/docs, tải lại trang và Authorize bằng token admin 1001 còn hạn. Owner đúng phạm vi cũng có quyền đổi trạng thái; tenant không có quyền.

## 2. Ghi nhận ban đầu

Trong Workbench, đúng kết nối DB mà BE đang dùng:

```sql
SELECT device_id, lifecycle_status, credential_status, mqtt_sync_status
FROM iot_db.devices
WHERE device_id IN ('node01', 'node02');

SELECT device_id, COUNT(*) AS so_ban_ghi, MAX(id) AS id_moi_nhat
FROM iot_db.history
WHERE device_id IN ('node01', 'node02')
GROUP BY device_id;
```

Node01 cần lifecycle_status=active, credential_status=active; mqtt_sync_status có thể unknown hoặc synced. Chạy câu đếm hai lần cách nhau 10 giây để xác nhận ESP đang gửi.

## 3. Khóa rồi mở lại

Trong Swagger, chọn PATCH /api/devices/{device_id}/lifecycle, Try it out, điền device_id=node01 và thay toàn bộ body bằng:

```json
{"lifecycle_status":"blocked"}
```

Execute cần trả 200, lifecycle_status=blocked, credential_status vẫn active. Đợi 10 giây rồi chạy câu đếm hai lần: node01 dừng tăng trong khi node02 vẫn tăng. Tài khoản MQTT và phiên của ESP vẫn có thể hoạt động.

Tại cùng endpoint, đổi body thành:

```json
{"lifecycle_status":"active"}
```

Execute cần trả 200. Đợi 10 giây, chạy lại câu đếm để xác nhận node01 tăng trở lại. Không cần đổi username/mật khẩu hay nạp lại ESP. Các bản tin bị BE từ chối lúc khóa không được lưu bù.

## 4. Bảo trì rồi hoạt động

Node01 đang active sau bước 3. Tại cùng endpoint, gửi:

```json
{"lifecycle_status":"maintenance","maintenance_note":"Test bao tri"}
```

Execute cần trả 200; node01 ngừng tăng dữ liệu, node02 vẫn tăng. Sau khi kiểm tra, gửi:

```json
{"lifecycle_status":"active","maintenance_note":"Hoan tat test"}
```

Execute cần trả 200; node01 ghi dữ liệu mới trở lại. Kết thúc bài test, kiểm tra node01 đã về active và credential vẫn active.

## Kết quả và lỗi cần phân biệt

- 200: đổi trạng thái BE thành công; dùng SQL xác minh các bản tin mới.
- 401: thiếu/sai/hết hạn token hoặc tài khoản không active/quyền khác token.
- 403: người gọi không có quyền quản lý node/phòng.
- 409 khi mở lại: thiếu nhật ký tạm dừng, thông tin MQTT thay đổi, credential chưa active, hoặc thao tác MQTT chưa hoàn tất. Ghi lại response; không đặt synced thủ công để bỏ qua kiểm tra.
- Không dùng action=revoke hoặc lifecycle_status=decommissioned trong bài test này: đó là luồng thu hồi/ngừng sử dụng khác.
