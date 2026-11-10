"""Validate node_full messages without inferring complete hardware health."""
import json
import math
import re

DS_HEALTH = {
    "ok": "Đọc nhiệt độ hợp lệ",
    "pending": "Đang chờ lần đo đầu tiên",
    "missing": "Chưa tìm thấy cảm biến DS18B20; kiểm tra dây và điện trở 4,7 kΩ",
    "read_error": "Không đọc được DS18B20; kiểm tra dây, nguồn hoặc dữ liệu CRC",
    "conversion_timeout": "DS18B20 không hoàn thành phép đo",
    "power_reset": "DS18B20 vừa mất nguồn/khởi động lại; chưa có số đo hợp lệ",
    "insufficient_power": "DS18B20 báo điều kiện nguồn không hợp lệ",
    "stale": "DS18B20 không có số đo mới đúng hạn",
}
MQ_HEALTH = {
    "ok": "Đọc tín hiệu DO ổn định",
    "warming_up": "MQ-2 đang trong thời gian chờ làm nóng",
    "filtering": "DO của MQ-2 đang đổi mức; chờ tín hiệu ổn định",
    "disabled": "MQ-2 đang bị tắt trong cấu hình chương trình (MQ2_ENABLED=false)",
    "unverified_interface": "Bản chương trình cũ đang chặn đọc MQ-2 (MQ2_INTERFACE_CONFIRMED=false); cần nạp bản mới",
}
MQ_ANALOG_HEALTH = {
    "ok": "Đọc tín hiệu AO của MQ-2; giá trị ADC chưa hiệu chuẩn ppm",
    "warming_up": "MQ-2 đang trong thời gian chờ làm nóng",
    "filtering": "Đang chờ tín hiệu AO của MQ-2 ổn định",
    "disabled": "MQ-2 đang bị tắt trong cấu hình chương trình (MQ2_ENABLED=false)",
}
FLAME_HEALTH = {
    "ok": "Đọc tín hiệu DO cảm biến lửa ổn định",
    "filtering": "DO của cảm biến lửa đang đổi mức; chờ tín hiệu ổn định",
    "disabled": "Cảm biến lửa đang bị tắt trong cấu hình chương trình (FLAME_ENABLED=false)",
    "power_checking": "Đang kiểm tra tín hiệu nguồn cảm biến lửa; chưa dùng DO để kết luận",
    "power_missing": "Không thấy tín hiệu nguồn tại điểm đo cảm biến lửa; kiểm tra VCC, GND và dây đo A0",
    "power_low": "Tín hiệu nguồn cảm biến lửa thấp hơn ngưỡng theo dõi; kiểm tra nguồn và dây đo A0",
}
FLAME_DO_HEALTH = {"ok", "filtering", "disabled"}
FLAME_POWER_HEALTH = {"checking", "present", "missing", "low"}
FLAME_DIGITAL_HEALTH = {key: FLAME_HEALTH[key] for key in
                        ("ok", "filtering", "disabled", "power_checking", "power_missing")}
FLAME_DIGITAL_HEALTH["power_missing"] = "Không thấy tín hiệu nguồn tại điểm đo cảm biến lửa; kiểm tra VCC, GND và nhánh D1"
ID = re.compile(r"[A-Za-z0-9_-]{1,32}\Z")


def integer(value, low, high):
    return type(value) is int and low <= value <= high


def number(value, low, high):
    return type(value) in (int, float) and math.isfinite(value) and low <= value <= high


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_message(raw):
    require(isinstance(raw, bytes) and len(raw) <= 4096, "Kích thước bản tin không hợp lệ")
    data = json.loads(raw.decode("utf-8"))
    require(type(data) is dict, "Bản tin phải là JSON object")
    for key, maximum in (("hardware_version", 32), ("firmware_version", 64)):
        if key in data:
            require(isinstance(data[key], str) and 0 < len(data[key]) <= maximum
                    and all(ord(character) >= 32 for character in data[key]), key + " không hợp lệ")
    require(integer(data.get("schema_version"), 2, 6),
            "Chỉ nhận bản tin node_full schema_version từ 2 đến 6")
    supports_flame = data["schema_version"] >= 3
    supports_flame_power = data["schema_version"] == 4
    digital_flame_power = data["schema_version"] == 6
    analog_mq = data["schema_version"] >= 5
    require(data.get("test") is True, "Bản thử phải có nhãn test=true")
    for key in ("device_id", "room"):
        require(isinstance(data.get(key), str) and ID.fullmatch(data[key]), f"{key} không hợp lệ")
    require(isinstance(data.get("boot_id"), str) and
            re.fullmatch(r"[0-9a-f]{16}", data["boot_id"]), "boot_id không hợp lệ")
    require(integer(data.get("seq"), 0, 2**32 - 1), "seq không hợp lệ")
    require(integer(data.get("uptime_s"), 0, 2**63 - 1), "uptime_s không hợp lệ")
    if "remote_config" in data:
        remote = data["remote_config"]
        require(data["schema_version"] == 6 and type(remote) is dict,
                "Cấu hình từ xa chỉ dùng với firmware V6 hỗ trợ chức năng này")
        require(set(remote) == {"version", "revision", "last_request_id"}
                and type(remote.get("version")) is int and remote["version"] == 1
                and integer(remote.get("revision"), 0, 2**32 - 1),
                "Phiên bản cấu hình từ xa không hợp lệ")
        request_id = remote.get("last_request_id")
        require(isinstance(request_id, str) and
                ((remote["revision"] == 0 and request_id == "") or
                 (remote["revision"] > 0 and re.fullmatch(r"[0-9a-f]{32}", request_id))),
                "Xác nhận cấu hình từ xa không hợp lệ")
    test_active, test_version = False, 0
    if "buzzer_test" in data:
        test = data["buzzer_test"]
        require(data["schema_version"] == 6 and type(test) is dict,
                "Thử còi và đèn chỉ dùng với firmware V6 hỗ trợ chức năng này")
        require(set(test) == {"version", "command_seq", "last_request_id", "status", "active", "remaining_ms"}
                and type(test.get("version")) is int and test["version"] in (1, 2)
                and integer(test.get("command_seq"), 0, 2**32 - 1), "Phiên bản thử còi và đèn không hợp lệ")
        test_version = test["version"]
        require(isinstance(test.get("last_request_id"), str) and
                ((test["command_seq"] == 0 and test["last_request_id"] == "") or
                 (test["command_seq"] > 0 and re.fullmatch(r"[0-9a-f]{32}", test["last_request_id"]))),
                "Mã xác nhận thử còi và đèn không hợp lệ")
        require(type(test.get("active")) is bool and integer(test.get("remaining_ms"), 0, 3000),
                "Thời gian thử còi và đèn không hợp lệ")
        require(isinstance(test.get("status"), str) and test["status"] in
                {"idle", "running", "completed", "stopped", "blocked", "interrupted"},
                "Trạng thái thử còi và đèn không hợp lệ")
        require((test["command_seq"] == 0) == (test["status"] == "idle"),
                "Bộ đếm và trạng thái thử còi và đèn không khớp")
        test_active = test["active"]
        require((test_active and test["status"] == "running" and test["remaining_ms"] > 0) or
                (not test_active and test["status"] != "running" and test["remaining_ms"] == 0),
                "Cờ thử còi và đèn không khớp thời gian/trạng thái")
    for key in ("temperature", "mq2", "network", "limits"):
        require(type(data.get(key)) is dict, f"Thiếu {key}")
    if supports_flame:
        require(type(data.get("flame")) is dict, "Thiếu flame")
    temp, mq, limits = data["temperature"], data["mq2"], data["limits"]
    require(isinstance(temp.get("health"), str) and temp["health"] in DS_HEALTH, "DS18B20 health không hợp lệ")
    mq_labels = MQ_ANALOG_HEALTH if analog_mq else MQ_HEALTH
    require(isinstance(mq.get("health"), str) and mq["health"] in mq_labels, "MQ-2 health không hợp lệ")
    require(type(temp.get("alarm")) is bool and type(mq.get("alarm")) is bool,
            "Cờ cảnh báo cảm biến phải là boolean")
    require(number(limits.get("temperature_on_c"), -55, 125) and
            number(limits.get("temperature_off_c"), -55, 125) and
            limits["temperature_on_c"] > limits["temperature_off_c"], "Ngưỡng nhiệt độ không hợp lệ")
    if temp["health"] == "ok":
        require(number(temp.get("value_c"), -55, 125), "Nhiệt độ không hợp lệ")
        if temp["value_c"] >= limits["temperature_on_c"]:
            require(temp["alarm"], "Nhiệt độ cao nhưng thiếu cờ cảnh báo")
        if temp["value_c"] <= limits["temperature_off_c"]:
            require(not temp["alarm"], "Nhiệt độ đã dưới ngưỡng xóa nhưng vẫn báo mới")
    else:
        require("value_c" in temp and temp["value_c"] is None,
                "Cảm biến lỗi không được gửi số đo cũ như số đo hợp lệ")
    require(integer(mq.get("warmup_remaining_s"), 0, 86400), "Thời gian chờ MQ-2 không hợp lệ")
    if analog_mq:
        require(mq.get("mode") == "analog", "MQ-2 V5/V6 phải dùng chế độ analog")
        require(mq.get("diagnostics") == "limited_analog", "Thiếu giới hạn chẩn đoán AO của MQ-2")
        require("do_level" in mq and mq["do_level"] is None, "MQ-2 analog phải gửi DO=null")
        require(integer(mq.get("adc_on"), 1, 1023) and integer(mq.get("adc_off"), 0, 1022)
                and mq["adc_off"] < mq["adc_on"], "Ngưỡng ADC MQ-2 không hợp lệ")
        if mq["health"] == "disabled":
            require("adc_raw" in mq and mq["adc_raw"] is None, "MQ-2 bị tắt phải gửi ADC=null")
        else:
            require(integer(mq.get("adc_raw"), 0, 1023), "ADC MQ-2 phải là số nguyên từ 0 đến 1023")
    else:
        require(integer(mq.get("alarm_level"), 0, 1), "MQ-2 alarm_level không hợp lệ")
        require(mq.get("diagnostics") == "limited_do", "Thiếu giới hạn chẩn đoán MQ-2")
        if mq["health"] in ("disabled", "unverified_interface"):
            require("do_level" in mq and mq["do_level"] is None, "MQ-2 bị tắt phải gửi DO=null")
        else:
            require(integer(mq.get("do_level"), 0, 1), "DO phải là 0 hoặc 1")
    if mq["health"] == "ok":
        require(mq["warmup_remaining_s"] == 0, "MQ-2 chưa hết thời gian chờ")
        if analog_mq:
            if mq["adc_raw"] >= mq["adc_on"]:
                require(mq["alarm"], "ADC MQ-2 đã đạt ngưỡng bật nhưng thiếu cảnh báo")
            if mq["adc_raw"] <= mq["adc_off"]:
                require(not mq["alarm"], "ADC MQ-2 đã xuống ngưỡng tắt nhưng vẫn báo mới")
        else:
            require(mq["alarm"] == (mq["do_level"] == mq["alarm_level"]), "DO và cờ cảnh báo mâu thuẫn")
    if supports_flame:
        flame = data["flame"]
        allowed_health = FLAME_DIGITAL_HEALTH if digital_flame_power else FLAME_HEALTH if supports_flame_power else FLAME_DO_HEALTH
        require(isinstance(flame.get("health"), str) and flame["health"] in allowed_health,
                "Cảm biến lửa health không hợp lệ")
        require(type(flame.get("alarm")) is bool, "Cờ cảnh báo lửa phải là boolean")
        require(integer(flame.get("alarm_level"), 0, 1), "Cảm biến lửa alarm_level không hợp lệ")
        require(flame.get("diagnostics") == "limited_do", "Thiếu giới hạn chẩn đoán cảm biến lửa")
        if analog_mq:
            require(all(key in flame and flame[key] is None for key in
                        ("power_adc", "power_adc_min", "power_adc_zero")),
                    "V5/V6 dành A0 cho MQ-2; các giá trị ADC nguồn Flame phải là null")
        if data["schema_version"] == 5:
            require(flame.get("power_health") == "not_monitored", "V5 không theo dõi nguồn Flame qua A0")
        if digital_flame_power:
            require(flame.get("power_mode") == "digital_d1", "V6 phải theo dõi nguồn Flame qua D1")
            require(integer(flame.get("power_level"), 0, 1), "Mức nguồn D1 phải là số nguyên 0 hoặc 1")
            require(isinstance(flame.get("power_health"), str) and
                    flame["power_health"] in {"checking", "present", "missing"},
                    "Trạng thái nguồn D1 không hợp lệ")
            power = flame["power_health"]
            if power == "present":
                require(flame["power_level"] == 1, "Nguồn hiện diện nhưng D1 không ở mức 1")
            elif power == "missing":
                require(flame["power_level"] == 0, "Mất tín hiệu nguồn nhưng D1 không ở mức 0")
            if flame["health"] in ("ok", "filtering"):
                require(power == "present", "Chưa xác nhận nguồn D1 để đọc DO Flame")
            elif flame["health"] != "disabled":
                require(flame["health"] == "power_" + power,
                        "Trạng thái Flame không khớp tín hiệu nguồn D1")
        if supports_flame_power:
            require(integer(flame.get("power_adc"), 0, 1023), "ADC nguồn cảm biến lửa không hợp lệ")
            require(integer(flame.get("power_adc_min"), 1, 1023), "Ngưỡng ADC nguồn cảm biến lửa không hợp lệ")
            require(integer(flame.get("power_adc_zero"), 0, 1022) and
                    flame["power_adc_zero"] < flame["power_adc_min"], "Ngưỡng ADC mất nguồn cảm biến lửa không hợp lệ")
            require(isinstance(flame.get("power_health"), str) and flame["power_health"] in FLAME_POWER_HEALTH,
                    "Trạng thái nguồn cảm biến lửa không hợp lệ")
            adc, minimum, zero = flame["power_adc"], flame["power_adc_min"], flame["power_adc_zero"]
            power = flame["power_health"]
            if power == "present":
                require(adc >= minimum, "Tín hiệu nguồn cảm biến lửa chưa đạt ngưỡng")
            elif power == "missing":
                require(adc <= zero, "ADC không khớp trạng thái mất tín hiệu nguồn")
            elif power == "low":
                require(zero < adc < minimum, "ADC không khớp trạng thái tín hiệu nguồn thấp")
            if flame["health"] in ("ok", "filtering"):
                require(power == "present", "Chưa xác nhận tín hiệu nguồn để đọc DO cảm biến lửa")
            elif flame["health"] != "disabled":
                require(flame["health"] == "power_" + power,
                        "Trạng thái cảm biến lửa không khớp tín hiệu nguồn")
        if flame["health"] == "disabled" or flame["health"].startswith("power_"):
            require("do_level" in flame and flame["do_level"] is None,
                    "Cảm biến lửa bị tắt hoặc chưa có tín hiệu nguồn hợp lệ phải gửi DO=null")
        else:
            require(integer(flame.get("do_level"), 0, 1), "DO cảm biến lửa phải là 0 hoặc 1")
        if flame["health"] == "ok":
            require(flame["alarm"] == (flame["do_level"] == flame["alarm_level"]),
                    "DO và cờ cảnh báo lửa mâu thuẫn")
    require(all(type(data["network"].get(key)) is bool for key in ("wifi", "mqtt")),
            "Trạng thái mạng phải là boolean")
    alarm = temp["alarm"] or mq["alarm"]
    healthy = temp["health"] == "ok" and mq["health"] == "ok"
    if supports_flame:
        alarm = alarm or flame["alarm"]
        healthy = healthy and flame["health"] == "ok"
        if supports_flame_power or digital_flame_power:
            healthy = healthy and flame["power_health"] == "present"
    expected = "alarm" if alarm else "normal" if healthy else "fault"
    require(data.get("system_state") == expected, "Trạng thái hệ thống không khớp cảm biến")
    expected_led = "red_blink" if test_active and test_version == 2 else {
        "normal": "green", "fault": "yellow", "alarm": "red_blink"}[expected]
    require(data.get("led") == expected_led,
            "Màu LED không khớp trạng thái")
    require(type(data.get("buzzer_cmd")) is bool and data["buzzer_cmd"] == (alarm or test_active),
            "Lệnh còi không khớp cảnh báo")
    return data


def sensor_details(data):
    temp, mq = data["temperature"], data["mq2"]
    details = []
    mq_labels = MQ_ANALOG_HEALTH if data["schema_version"] >= 5 else MQ_HEALTH
    sensors = [("DS18B20", temp, DS_HEALTH), ("MQ-2", mq, mq_labels)]
    if data["schema_version"] >= 3:
        sensors.append(("Flame", data["flame"], FLAME_DIGITAL_HEALTH if data["schema_version"] == 6 else FLAME_HEALTH))
    for sensor, reading, labels in sensors:
        message = labels[reading["health"]]
        if sensor == "MQ-2" and data["schema_version"] < 5:
            message += " · Chưa chuyển MQ-2 sang AO; nạp V6 và nối AO qua chia áp vào A0"
        if sensor == "Flame" and data["schema_version"] in (3, 5):
            message += " · Chưa theo dõi nguồn Flame; cần V6 và nhánh D1. DO không phát hiện đầy đủ mất nguồn hoặc đứt dây"
        details.append({
            "sensor": sensor, "health": reading["health"],
            "message": message,
            "alarm": reading["alarm"],
            "alarm_held": reading["alarm"] and reading["health"] != "ok",
        })
    if data["schema_version"] == 2:
        details.append({
            "sensor": "Flame", "health": "not_supported",
            "message": "Firmware V1/V2 chưa gửi dữ liệu cảm biến lửa; cần nạp firmware V6 và nhánh D1",
            "alarm": False, "alarm_held": False,
        })
    return details
