import json
import time
import paho.mqtt.client as mqtt

BROKER = "127.0.0.1"
PORT = 1883
DEVICE_ID = "esp32_sim_01"
TOPIC = f"iot/devices/{DEVICE_ID}/telemetry"

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        print("Đã kết nối thành công tới MQTT Broker!")
    else:
        print(f"Kết nối thất bại, mã lỗi {rc}")

client.on_connect = on_connect
client.connect(BROKER, PORT, 60)
client.loop_start()

print("Bắt đầu gửi dữ liệu giả lập chuẩn schema V6... Nhấn Ctrl+C để dừng.")
seq_num = 0

try:
    while True:
        seq_num += 1
        payload = {
            "schema_version": 6,
            "test": True,
            "device_id": DEVICE_ID,
            "room": "phong_tro_01",
            "boot_id": "1234567890abcdef",
            "seq": seq_num,
            "uptime_s": seq_num * 3,
            "system_state": "normal",
            "led": "green",
            "buzzer_cmd": False,
            "temperature": {
                "health": "ok",
                "value_c": 28.5,
                "alarm": False
            },
            "mq2": {
                "health": "ok",
                "mode": "analog",
                "diagnostics": "limited_analog",
                "do_level": None,
                "adc_raw": 300,
                "adc_on": 600,
                "adc_off": 400,
                "warmup_remaining_s": 0,
                "alarm": False
            },
            "flame": {
                "health": "ok",
                "alarm_level": 0,
                "diagnostics": "limited_do",
                "power_mode": "digital_d1",
                "power_level": 1,
                "power_health": "present",
                "power_adc": None,
                "power_adc_min": None,
                "power_adc_zero": None,
                "do_level": 1,
                "alarm": False
            },
            "network": {
                "wifi": True,
                "mqtt": True
            },
            "limits": {
                "temperature_on_c": 35.0,
                "temperature_off_c": 30.0
            }
        }
        
        client.publish(TOPIC, json.dumps(payload))
        print(f"Đã gửi telemetry hợp lệ (seq={seq_num})")
        time.sleep(3)
except KeyboardInterrupt:
    client.loop_stop()
    client.disconnect()
    print("Đã dừng chương trình giả lập.")