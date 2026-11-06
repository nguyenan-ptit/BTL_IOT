"""Kiểm tra API Đăng ký & Vòng đời thiết bị.

Cách dùng (server phải đang chạy: uvicorn app:app --reload):
    1. Sửa 5 hằng số trong khối CẤU HÌNH bên dưới.
    2. python test_devices.py
Cuối cùng in ra PASS / FAIL cho từng yêu cầu.
"""
import os
import sys
import time

import jwt
import requests

# ============================ CẤU HÌNH ============================
BASE = "http://127.0.0.1:8000"
SECRET = os.environ.get("JWT_SECRET", "doi-khoa-bi-mat-nay")  # phải khớp auth.py

ADMIN_ID = 2      # user_id có role = admin
OWNER_ID = 3      # user_id có role = owner
TENANT_ID = 4     # user_id có role = tenant (hoặc số bất kỳ)
OWN_ROOM = "T-OWN"     # phòng THUỘC khu nhà của OWNER_ID
OTHER_ROOM = "101"   # phòng KHÔNG thuộc OWNER_ID
# ==================================================================

results = []


def token(user_id, role):
    return jwt.encode({"user_id": user_id, "role": role}, SECRET, algorithm="HS256")


def hdr(user_id=None, role=None):
    return {"Authorization": f"Bearer {token(user_id, role)}"} if user_id else {}


ADMIN = hdr(ADMIN_ID, "admin")
OWNER = hdr(OWNER_ID, "owner")
TENANT = hdr(TENANT_ID, "tenant")


def check(name, resp, expected, show=False):
    ok = resp.status_code == expected
    results.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}  (nhận {resp.status_code}, cần {expected})")
    if not ok or show:
        print("        ->", resp.text[:300])
    return resp


def register(headers, dev, room, user):
    return requests.post(f"{BASE}/api/devices/register", headers=headers, json={
        "device_id": dev, "device_name": f"Node {dev}", "room_id": room,
        "mqtt_username": user, "board_model": "ESP32", "firmware_version": "1.0.0"})


def patch(headers, dev, body):
    return requests.patch(f"{BASE}/api/devices/{dev}/lifecycle", headers=headers, json=body)


stamp = str(int(time.time()))[-7:]
A, B = f"TA{stamp}", f"TB{stamp}"

print("\n=== YÊU CẦU 1: Đăng ký node, lưu ID + credential tham chiếu, gán phòng đúng phân quyền ===")
check("Không có token -> bị từ chối", requests.post(f"{BASE}/api/devices/register", json={}), 401)
check("Tenant đăng ký -> bị từ chối", register(TENANT, A, OWN_ROOM, f"u{A}"), 403)
r = check("Admin đăng ký node", register(ADMIN, A, OWN_ROOM, f"u{A}"), 201)
if r.ok:
    d = r.json()
    ok = d.get("lifecycle_status") == "registered" and d.get("credential_status") == "pending"
    results.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] Trạng thái ban đầu = registered / pending")
check("Trùng device_id/mqtt_username", register(ADMIN, A, OWN_ROOM, f"u{A}"), 409)
check("Phòng không tồn tại", register(ADMIN, f"X{stamp}", "KHONG_CO", f"ux{stamp}"), 404)
check("Owner đăng ký vào phòng của mình", register(OWNER, B, OWN_ROOM, f"u{B}"), 201)
check("Owner đăng ký vào phòng người khác -> bị từ chối",
      register(OWNER, f"Y{stamp}", OTHER_ROOM, f"uy{stamp}"), 403)
check("Thiếu trường bắt buộc", requests.post(
    f"{BASE}/api/devices/register", headers=ADMIN, json={"device_id": "abc"}), 422)

print("\n=== YÊU CẦU 2: Vòng đời + ràng buộc chuyển trạng thái ===")
check("registered -> active (nhảy cóc) bị cấm", patch(ADMIN, A, {"lifecycle_status": "active"}), 409)
check("registered -> maintenance bị cấm", patch(ADMIN, A, {"lifecycle_status": "maintenance"}), 409)
check("Giá trị trạng thái sai", patch(ADMIN, A, {"lifecycle_status": "bay_mau"}), 422)
check("Body rỗng", patch(ADMIN, A, {}), 400)
check("registered -> provisioned", patch(ADMIN, A, {"lifecycle_status": "provisioned"}), 200)
check("Kích hoạt khi credential chưa active bị cấm",
      patch(ADMIN, A, {"lifecycle_status": "active"}), 409)
check("Kích hoạt + cấp credential active",
      patch(ADMIN, A, {"lifecycle_status": "active", "credential_status": "active"}), 200)
check("Bảo trì (kèm ghi chú)",
      patch(ADMIN, A, {"lifecycle_status": "maintenance", "maintenance_note": "Thay cảm biến MQ2"}), 200)
check("Hết bảo trì -> active", patch(ADMIN, A, {"lifecycle_status": "active"}), 200)
check("Tạm khóa", patch(ADMIN, A, {"lifecycle_status": "blocked"}), 200)
check("Mở khóa", patch(ADMIN, A, {"lifecycle_status": "active"}), 200)
check("Thu hồi credential", patch(ADMIN, A, {"credential_status": "revoked"}), 200)
check("Khóa lại", patch(ADMIN, A, {"lifecycle_status": "blocked"}), 200)
check("Mở khóa khi credential đã thu hồi bị cấm",
      patch(ADMIN, A, {"lifecycle_status": "active"}), 409)
check("Credential revoked không cấp lại được",
      patch(ADMIN, A, {"credential_status": "active"}), 409)
check("Ngừng sử dụng", patch(ADMIN, A, {"lifecycle_status": "decommissioned"}), 200)
check("Đã ngừng sử dụng -> không đổi được nữa",
      patch(ADMIN, A, {"lifecycle_status": "active"}), 409)

print("\n=== PHÂN QUYỀN trên vòng đời ===")
check("Owner đổi trạng thái thiết bị của phòng mình",
      patch(OWNER, B, {"lifecycle_status": "provisioned"}), 200)
register(ADMIN, f"TC{stamp}", OTHER_ROOM, f"uc{stamp}")
check("Owner đổi thiết bị của phòng người khác -> bị từ chối",
      patch(OWNER, f"TC{stamp}", {"lifecycle_status": "provisioned"}), 403)
check("Tenant đổi trạng thái -> bị từ chối", patch(TENANT, B, {"lifecycle_status": "blocked"}), 403)
check("Thiết bị không tồn tại", patch(ADMIN, f"ZZ{stamp}", {"lifecycle_status": "blocked"}), 404)

passed, total = sum(results), len(results)
print(f"\nKẾT QUẢ: {passed}/{total} PASS")
print("Kiểm tra thêm nhật ký trong MySQL:\n"
      "  SELECT actor_user_id, action, target_id, details FROM audit_logs ORDER BY log_id DESC LIMIT 20;")
sys.exit(0 if passed == total else 1)