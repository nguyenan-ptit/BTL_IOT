-- Chỉ dùng với schema iot_ota_test. Tạo đầy đủ schema từ init.sql trước.
-- Tài khoản mẫu có mật khẩu công khai, dùng cho backend thử nghiệm cục bộ.
SET time_zone = '+00:00';
START TRANSACTION;

INSERT INTO iot_ota_test.users (username, password_hash, full_name, role, status)
VALUES ('ota_test_admin',
        '$argon2id$v=19$m=65536,t=3,p=4$SAuvpylVa3+M9IFeJQ4T+Q$NOhpMie9lJu9rGOFlGn6RreYJSAMi6DG3G/MKyR3xCM',
        'Quản trị thử OTA', 'admin', 'active')
ON DUPLICATE KEY UPDATE user_id = user_id;

INSERT INTO iot_ota_test.houses (house_id, owner_id, house_name)
SELECT 9101, user_id, 'Nhà thử OTA'
FROM iot_ota_test.users WHERE username = 'ota_test_admin' AND role = 'admin'
ON DUPLICATE KEY UPDATE house_id = houses.house_id;

INSERT INTO iot_ota_test.rooms (room_id, house_id, room_name)
VALUES ('OTA-DEMO', 9101, 'Phòng thử OTA')
ON DUPLICATE KEY UPDATE room_id = room_id;

INSERT INTO iot_ota_test.devices
    (device_id, room_id, device_name, board_model, mqtt_username,
     credential_status, lifecycle_status, firmware_version, activated_at, last_seen_at)
VALUES ('node-ota-demo', 'OTA-DEMO', 'Node dữ liệu giả lập', 'NodeMCU ESP-12E',
        'ota-demo-unused', 'active', 'active', 'v1.0.0', UTC_TIMESTAMP(),
        UTC_TIMESTAMP() - INTERVAL 1 MINUTE)
ON DUPLICATE KEY UPDATE device_id = device_id;

INSERT INTO iot_ota_test.history
    (timestamp, device_id, room_id, room, boot_id, seq, system_state,
     temperature_c, mq2_adc, flame_do, raw_payload, created_at)
VALUES (
    UTC_TIMESTAMP() - INTERVAL 1 MINUTE, 'node-ota-demo', 'OTA-DEMO', 'OTA-DEMO',
    '0123456789abcdef', 1, 'normal', 28.5, 42, 1,
    '{
        "schema_version":6,"test":true,"device_id":"node-ota-demo","room":"OTA-DEMO",
        "boot_id":"0123456789abcdef","seq":1,"uptime_s":600,"system_state":"normal",
        "firmware_version":"v1.0.0","ota_supported":false,"led":"green","buzzer_cmd":false,
        "temperature":{"value_c":28.5,"health":"ok","alarm":false},
        "mq2":{"mode":"analog","do_level":null,"adc_raw":42,"adc_on":60,"adc_off":55,
               "health":"ok","alarm":false,"diagnostics":"limited_analog","warmup_remaining_s":0},
        "flame":{"do_level":1,"health":"ok","alarm":false,"alarm_level":0,
                 "diagnostics":"limited_do","power_adc":null,"power_mode":"digital_d1",
                 "power_level":1,"power_health":"present","power_adc_min":null,"power_adc_zero":null},
        "network":{"wifi":true,"mqtt":true},
        "limits":{"temperature_on_c":60.0,"temperature_off_c":55.0}
    }',
    UTC_TIMESTAMP() - INTERVAL 1 MINUTE
)
ON DUPLICATE KEY UPDATE id = id;

COMMIT;

SELECT device_id, temperature_c, mq2_adc, timestamp
FROM iot_ota_test.history WHERE device_id = 'node-ota-demo';
