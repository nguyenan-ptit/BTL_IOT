USE iot_db;

INSERT IGNORE INTO users (user_id, username, password_hash, full_name, role, status)
VALUES (1, 'demo_owner', 'DEMO-NOT-A-REAL-HASH', 'Chủ trọ demo', 'owner', 'locked');

INSERT IGNORE INTO houses (house_id, owner_id, house_name, address)
VALUES (1, 1, 'Nhà trọ demo', NULL);

INSERT IGNORE INTO rooms (room_id, house_id, room_name)
VALUES ('101', 1, 'Phòng 101'), ('102', 1, 'Phòng 102');

INSERT IGNORE INTO devices (device_id, room_id, device_name, board_model, mqtt_username,
                            credential_status, lifecycle_status, activated_at)
VALUES ('node01', '101', 'Node phòng 101', 'NodeMCU ESP-12E', 'node01', 'active', 'active', UTC_TIMESTAMP()),
       ('node02', '102', 'Node phòng 102', 'NodeMCU ESP-12E', 'node02', 'active', 'active', UTC_TIMESTAMP());