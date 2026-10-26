# BTL_IOT

Kho mã nguồn cho bài tập lớn IoT.

## Cấu trúc repository

```text
BTL_IOT/
├── README.md
├── firmware/
├── backend/
├── frontend/
├── database/
├── deployment/
├── hardware/
├── tests/
├── docs/
└── .env.example
```

| Thư mục | Nội dung |
| --- | --- |
| `firmware/` | Mã nguồn chạy trên vi điều khiển và thiết bị IoT. |
| `backend/` | Dịch vụ xử lý dữ liệu, API và giao tiếp với thiết bị. |
| `frontend/` | Giao diện theo dõi và điều khiển hệ thống. |
| `database/` | Thiết kế cơ sở dữ liệu, migration và dữ liệu mẫu. |
| `deployment/` | Cấu hình và hướng dẫn triển khai hệ thống. |
| `hardware/` | Sơ đồ mạch, kết nối chân và danh sách linh kiện. |
| `tests/` | Kiểm thử các thành phần và toàn bộ hệ thống. |
| `docs/` | Tài liệu yêu cầu, thiết kế, sử dụng và báo cáo. |

## Cấu hình môi trường

Sao chép `.env.example` thành `.env` và bổ sung các giá trị cần thiết khi triển khai từng thành phần. Không đưa mật khẩu, token hoặc khóa bí mật vào repository.

Repository hiện có cấu trúc ban đầu; mã nguồn và hướng dẫn chạy sẽ được bổ sung khi các thành phần được triển khai. Các tệp `.gitkeep` giúp Git lưu những thư mục chưa có nội dung.
