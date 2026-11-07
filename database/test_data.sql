USE iot_db;
-- Dữ liệu dùng riêng để kiểm thử API đăng ký & vòng đời thiết bị.
-- Chạy SAU init.sql và seed_demo.sql (cần phòng '101' của demo_owner
-- làm "phòng của người khác" trong test phân quyền).
-- Có thể chạy lại nhiều lần: INSERT IGNORE bỏ qua dòng đã tồn tại.

INSERT IGNORE INTO users (user_id, username, password_hash, full_name, role, status)
VALUES (1001, 'test_admin',  'DEMO-NOT-A-REAL-HASH', 'Test Admin',  'admin',  'locked'),
       (1002, 'test_owner',  'DEMO-NOT-A-REAL-HASH', 'Test Owner',  'owner',  'locked'),
       (1003, 'test_tenant', 'DEMO-NOT-A-REAL-HASH', 'Test Tenant', 'tenant', 'locked');

INSERT IGNORE INTO houses (house_id, owner_id, house_name)
VALUES (1001, 1002, 'Nhà test');

INSERT IGNORE INTO rooms (room_id, house_id, room_name)
VALUES ('T-OWN', 1001, 'Phòng test của owner');