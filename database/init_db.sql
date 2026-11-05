CREATE DATABASE IF NOT EXISTS iot_db;
USE iot_db;

CREATE TABLE IF NOT EXISTS history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    device_id VARCHAR(50) NOT NULL,
    room VARCHAR(50) NOT NULL,
    boot_id VARCHAR(50),
    seq INT,
    system_state VARCHAR(20),
    temperature_c FLOAT,
    mq2_adc INT,
    flame_do INT,
    raw_payload TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_device_time (device_id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;