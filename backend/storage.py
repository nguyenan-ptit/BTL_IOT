import json
import os
import pymysql
from datetime import datetime, timezone
from validation import sensor_details


CONFIG_PATH = os.path.join(os.path.dirname(__file__), "settings.local.json")

def get_db_connection():
    
    mysql_config = {
        "host": "localhost",
        "port": 3306,
        "user": "root",
        "password": "", 
        "database": "iot_db",
        "cursorclass": pymysql.cursors.DictCursor
    }
    
   
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                if "mysql" in data:
                    mysql_config.update(data["mysql"])
        except Exception as e:
            print(f"Lỗi đọc file cấu hình MySQL: {e}")
            
    return pymysql.connect(**mysql_config)

def initialize(path=None):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
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
            """)
        conn.commit()
    finally:
        conn.close()

def save(path, data, received_at=None):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            ts = received_at or datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
            
            dev_id = data.get("device_id", "")
            room = data.get("room", "")
            boot_id = data.get("boot_id", "")
            seq = data.get("seq", 0)
            sys_state = data.get("system_state", "normal")
            
            temp = data.get("temperature", {}).get("value_c")
            mq2 = data.get("mq2", {}).get("adc_raw")
            flame = 1 if data.get("flame", {}).get("alarm") else 0
            
            sql = """
                INSERT INTO history (
                    timestamp, device_id, room, boot_id, seq, 
                    system_state, temperature_c, mq2_adc, flame_do, raw_payload
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(sql, (
                ts, dev_id, room, boot_id, seq,
                sys_state, temp, mq2, flame, 
                json.dumps(data, ensure_ascii=False, allow_nan=False)
            ))
        conn.commit()
        return True
    except Exception as e:
        print(f"Lỗi khi lưu MySQL: {e}")
        return False
    finally:
        conn.close()

def read_latest(path=None, now=None):
    now = now or datetime.now(timezone.utc)
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT h.* FROM history h
                INNER JOIN (
                    SELECT device_id, MAX(id) as max_id 
                    FROM history 
                    GROUP BY device_id
                ) latest ON h.id = latest.max_id
                ORDER BY h.device_id
            """
            cursor.execute(sql)
            rows = cursor.fetchall()
            
        items = []
        for row in rows:
            data = json.loads(row["raw_payload"])
            try:
                # Đổi timestamp sang dạng age tính giây
                rec_time = row["timestamp"]
                if isinstance(rec_time, str):
                    rec_dt = datetime.fromisoformat(rec_time)
                else:
                    rec_dt = rec_time.replace(tzinfo=timezone.utc)
                age = (now - rec_dt).total_seconds()
                online = 0 <= age <= 20
            except (ValueError, TypeError):
                age, online = None, False
                
            configuration_pending = data.get("schema_version", 6) < 6
            display_state = "offline" if not online else data.get("system_state", "normal")
            if online and configuration_pending and display_state != "alarm":
                display_state = "fault"
                
            items.append({
                "data": data, 
                "online": online, 
                "received_at": str(row["timestamp"]),
                "age_seconds": age, 
                "display_state": display_state,
                "configuration_pending": configuration_pending,
                "sensors": sensor_details(data),
            })
        return items
    finally:
        conn.close()

def history(path, device_id, limit=20):
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT timestamp, raw_payload FROM history 
                WHERE device_id = %s 
                ORDER BY id DESC LIMIT %s
            """
            cursor.execute(sql, (device_id, limit))
            rows = cursor.fetchall()
            
        return [
            {"received_at": str(row["timestamp"]), "data": json.loads(row["raw_payload"])} 
            for row in rows
        ]
    finally:
        conn.close()