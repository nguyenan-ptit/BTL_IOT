-- Tạo mới database nếu chưa có và chọn sử dụng
CREATE DATABASE IF NOT EXISTS iot_db;
USE iot_db;
SET time_zone = '+00:00';

-- 1. Bảng Users (Quản lý tài khoản, phân quyền chuẩn và trạng thái tài khoản)
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NULL,
    role ENUM('admin', 'owner', 'tenant') NOT NULL DEFAULT 'tenant',
    status ENUM('active', 'locked') NOT NULL DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    last_login_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Bảng Houses (Quản lý các khu nhà trọ)
CREATE TABLE houses (
    house_id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL,
    house_name VARCHAR(100) NOT NULL,
    address VARCHAR(255) NULL,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Bảng Rooms (Quản lý phòng trọ thuộc các khu nhà)
CREATE TABLE rooms (
    room_id VARCHAR(20) PRIMARY KEY,
    house_id INT NOT NULL,
    room_name VARCHAR(50) NOT NULL,
    description TEXT,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (house_id) REFERENCES houses(house_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Bảng Room_Users (Quản lý phân quyền người thuê phòng theo thời gian)
CREATE TABLE room_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id VARCHAR(20) NOT NULL,
    user_id INT NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Bảng Devices (Quản lý vòng đời thiết bị/node cảm biến)
CREATE TABLE devices (
    device_id VARCHAR(64) PRIMARY KEY, -- Chuẩn hóa lên 64 ký tự
    room_id VARCHAR(20) NULL,
    device_name VARCHAR(100) NOT NULL,
    board_model VARCHAR(64) NULL,
    mqtt_username VARCHAR(64) NOT NULL UNIQUE,
    mqtt_client_id VARCHAR(128) NULL,
    mqtt_sync_status ENUM('unknown', 'pending', 'synced', 'failed') NOT NULL DEFAULT 'unknown',
    mqtt_operation_id CHAR(32) NULL,
    credential_status ENUM('pending', 'active', 'revoked') DEFAULT 'pending',
    lifecycle_status ENUM('registered', 'provisioned', 'active', 'maintenance', 'blocked', 'decommissioned') DEFAULT 'registered',
    hardware_version VARCHAR(32) NULL,
    firmware_version VARCHAR(64) NULL,
    registered_by INT NULL,
    activated_at DATETIME NULL,
    last_seen_at DATETIME NULL,
    maintenance_note TEXT NULL,
    decommissioned_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(room_id),
    FOREIGN KEY (registered_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Bảng History (Lưu trữ telemetry định kỳ từ MQTT - Chống trùng lặp & tránh tràn số)
CREATE TABLE history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    device_id VARCHAR(64) NOT NULL, -- Chuẩn hóa lên 64 ký tự
    room_id VARCHAR(20) NULL,
    room VARCHAR(50) NOT NULL, -- Nhãn gốc ESP gửi lên
    boot_id CHAR(16) NOT NULL,
    seq INT UNSIGNED NOT NULL, -- Tránh tràn số với seq lớn
    system_state VARCHAR(20),
    temperature_c FLOAT NULL,
    mq2_adc INT NULL,
    flame_do INT NULL, -- Lưu đúng mức tín hiệu DO của cảm biến lửa
    raw_payload TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_history_message (device_id, boot_id, seq), -- ĐÃ SỬA: Dùng toàn bộ device_id, bỏ giới hạn (30) để khớp validator
    INDEX idx_device_time (device_id, timestamp),
    INDEX idx_room_time (room_id, timestamp),
    FOREIGN KEY (device_id) REFERENCES devices(device_id),
    FOREIGN KEY (room_id) REFERENCES rooms(room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Bảng Incidents (Lưu vết sự cố, cảnh báo từ cảm biến theo vòng đời xử lý)
CREATE TABLE incidents (
    incident_id INT AUTO_INCREMENT PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    room_id VARCHAR(20) NULL,
    alert_type VARCHAR(50) NOT NULL,
    message TEXT,
    status ENUM('open', 'handling', 'recovered', 'closed') DEFAULT 'open',
    trigger_details JSON NULL,
    handled_by INT NULL,
    handled_at DATETIME NULL,
    last_detected_at DATETIME NULL,
    recovered_at DATETIME NULL,
    closed_by INT NULL,
    closed_at DATETIME NULL,
    notes TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(device_id),
    FOREIGN KEY (room_id) REFERENCES rooms(room_id),
    FOREIGN KEY (handled_by) REFERENCES users(user_id),
    FOREIGN KEY (closed_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Bảng Incident_Receipts (Theo dõi trạng thái đã xem sự cố của từng người dùng)
CREATE TABLE incident_receipts (
    incident_id INT NOT NULL,
    user_id INT NOT NULL,
    seen_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (incident_id, user_id),
    FOREIGN KEY (incident_id) REFERENCES incidents(incident_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Bảng Device_Commands (Lưu lịch sử lệnh điều khiển thiết bị)
CREATE TABLE device_commands (
    command_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    request_id CHAR(32) NOT NULL UNIQUE,
    device_id VARCHAR(64) NOT NULL,
    room_id VARCHAR(20) NULL,
    requested_by INT NULL,
    command_type VARCHAR(32) NOT NULL,
    request_payload JSON NULL,
    response_payload JSON NULL,
    status VARCHAR(30) DEFAULT 'pending',
    expected_boot_id CHAR(16) NULL,
    expected_revision INT UNSIGNED NULL,
    expected_command_seq INT UNSIGNED NULL,
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    deadline_at DATETIME NULL,
    acknowledged_at DATETIME NULL,
    finished_at DATETIME NULL,
    error_message VARCHAR(255) NULL,
    FOREIGN KEY (device_id) REFERENCES devices(device_id),
    FOREIGN KEY (room_id) REFERENCES rooms(room_id),
    FOREIGN KEY (requested_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. Bảng Audit_Logs (Ghi nhật ký thao tác hệ thống và bảo mật)
CREATE TABLE audit_logs (
    log_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_user_id INT NULL,
    room_id VARCHAR(20) NULL,
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(32) NOT NULL,
    target_id VARCHAR(64) NOT NULL,
    result ENUM('success', 'denied', 'failure') NOT NULL,
    details JSON NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_user_id) REFERENCES users(user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Password digests only verify retry inputs. MQTT passwords and admin keys are never stored.
CREATE TABLE mqtt_operations (
    operation_id CHAR(32) PRIMARY KEY,
    device_id VARCHAR(64) NOT NULL,
    room_id VARCHAR(20) NULL,
    requested_by INT NOT NULL,
    action ENUM('provision', 'reissue', 'revoke') NOT NULL,
    status ENUM('processing', 'succeeded', 'incomplete') NOT NULL,
    target_username VARCHAR(64) NULL,
    subject_usernames JSON NOT NULL,
    password_digest CHAR(64) NULL,
    steps JSON NOT NULL,
    error_code VARCHAR(64) NULL,
    created_at DATETIME NOT NULL,
    finished_at DATETIME NULL,
    INDEX idx_mqtt_device (device_id, created_at),
    FOREIGN KEY (device_id) REFERENCES devices(device_id),
    FOREIGN KEY (room_id) REFERENCES rooms(room_id),
    FOREIGN KEY (requested_by) REFERENCES users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE schema_migrations (
    version VARCHAR(32) PRIMARY KEY,
    applied_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO schema_migrations (version, applied_at) VALUES ('20261106_01', UTC_TIMESTAMP());
