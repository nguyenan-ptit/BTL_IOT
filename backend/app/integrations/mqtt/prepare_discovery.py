import os

# Định nghĩa đường dẫn và khóa mẫu phục vụ discovery UDP
KEY_FILE = "discovery_key.bin"

def read_discovery_key():
    if os.path.exists(KEY_FILE):
        with open(KEY_FILE, "rb") as f:
            return f.read()
    # Trả về khóa mặc định nếu chưa có file key chuyên biệt
    return b"default_iot_discovery_key_32bytes_length!!"