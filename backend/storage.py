import json
import pymysql
from datetime import datetime, timezone
from validation import sensor_details

# Cấu hình kết nối MySQL 
MYSQL_CONFIG = {
    "host": "localhost",
    "port": 3306,
    "user": "root",
    "password": "", 
    "database": "iot_db",
    "cursorclass": pymysql.cursors.DictCursor
}

def get_db_connection():
    return pymysql.connect(**MYSQL_CONFIG)

def initialize(path=None):
    """Khởi tạo bảng history trong MySQL nếu chưa tồn tại"""
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
    """Lưu bản tin telemetry vào bảng history của MySQL (hỗ trợ trích xuất linh hoạt chống giá trị NULL)"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            ts = received_at or datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
            
            dev_id = data.get("device_id", "")
            room = data.get("room", "")
            boot_id = data.get("boot_id", "")
            seq = data.get("seq", 0)
            sys_state = data.get("system_state", "normal")
            
            # Xử lý trích xuất linh hoạt (hỗ trợ cả dạng dict lồng nhau lẫn dạng giá trị thô)
            temp_obj = data.get("temperature")
            if isinstance(temp_obj, dict):
                temp = temp_obj.get("value_c")
            else:
                temp = temp_obj
                
            mq2_obj = data.get("mq2")
            if isinstance(mq2_obj, dict):
                mq2 = mq2_obj.get("adc_raw")
            else:
                mq2 = data.get("mq2_adc", mq2_obj)
                
            flame_obj = data.get("flame")
            if isinstance(flame_obj, dict):
                flame = 1 if flame_obj.get("alarm") else 0
            else:
                flame = 1 if flame_obj else 0
            
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
    """Lấy bản tin mới nhất của từng thiết bị để hiển thị lên giao diện"""
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
    """Lấy danh sách lịch sử telemetry của một thiết bị cụ thể"""
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