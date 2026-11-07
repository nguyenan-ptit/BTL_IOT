# Frontend: website giám sát cháy/gas nhà trọ

React 19 + TypeScript + Tailwind CSS 4, Zod, nuqs, TanStack Query, React Router, chạy bằng Vite. Đặc tả nằm ở `specs/001-web-giam-sat-canh-bao/`.

Backend FastAPI/MySQL đã có trong `backend/`, nhưng website hiện vẫn mặc định chạy với **dữ liệu giả lập** (MSW): mọi request `/api/...` được trả lời ngay trong trình duyệt theo hợp đồng ở `specs/001-web-giam-sat-canh-bao/contracts/api.md`. Hợp đồng mock chưa khớp toàn bộ [API backend hiện tại](../docs/LONG_API.md); chỉ đổi biến môi trường sang false chưa hoàn tất tích hợp.

## Yêu cầu

- Node.js 22 trở lên (đã thử với 24.21), npm 10 trở lên.
- Không cần backend, MQTT hay phần cứng khi chạy giả lập.

## Chạy lần đầu

```powershell
cd frontend
npm install
copy .env.example .env.local     # macOS/Linux: cp .env.example .env.local
npm run dev
```

Mở http://localhost:5173. File `.env.local` mặc định có `VITE_USE_MOCK=true`.

## Tài khoản mẫu (chỉ có trong dữ liệu giả lập)

Trang đăng nhập có nút chọn nhanh. Mật khẩu chung của các tài khoản mẫu ghi trong `src/mocks/seed.ts`.

| Tên đăng nhập | Vai trò | Thấy gì |
| --- | --- | --- |
| `chutro` | Chủ trọ | Phòng 101, 102, 103 |
| `thue101` | Người thuê | Phòng 101 |
| `thue102` | Người thuê | Phòng 102 |
| `admin` | Quản trị viên | Mọi phòng, quản lý node, tài khoản, nhật ký |

## Mô phỏng tình huống

Khi chạy giả lập, góc phải dưới có nút **Mô phỏng**. Chọn phòng rồi bấm: Rò gas, Cháy, Hỏng cảm biến nhiệt/gas, Rút nguồn node, Cắm lại (gửi bù), Về bình thường. Số đo mới sinh mỗi 2 giây; sự cố tự kết thúc khoảng 20 giây sau khi số đo về bình thường.

Lưu ý: dữ liệu giả lập sống trong từng tab. Tải lại trang (F5) là dữ liệu về như ban đầu; tài khoản hay node tạo thêm sẽ mất. Muốn thử nhiều tài khoản thì đăng xuất rồi đăng nhập lại trong cùng tab.

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Chạy dev server ở cổng 5173 |
| `npm run typecheck` | Kiểm tra kiểu TypeScript |
| `npm run lint` | oxlint |
| `npm run format` | Prettier cho `src` và `tests` |
| `npm test` | Test đơn vị (Vitest) |
| `npm run build` | Build ra `dist/` |
| `npm run preview` | Xem thử bản build |
| `npm run test:e2e` | Playwright (chưa có test; cần `npx playwright install` trước) |

## Nối backend thật

Nguyên cần đối chiếu các endpoint `/api/nodes`, `/api/auth/*` và kiểu JSON hiện dùng với `/api/devices`, `/api/history` và các API quản lý/điều khiển trong LONG_API. Vĩ cung cấp dịch vụ đăng ký/đăng nhập và JWT; Long hiện xác minh JWT, chưa cung cấp endpoint tự đăng nhập/đăng ký người dùng. Thống nhất response, xử lý 401/403/409/202 và bỏ qua MSW khi đã tích hợp. Phân công và các bước nghiệm thu ở [HANDOVER](../docs/HANDOVER.md).

Trong `.env.local`:

```
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://<máy-backend>:8000
```

Chạy lại `npm run dev`. Vite chuyển mọi request `/api` sang backend (proxy), nên không cần cấu hình CORS khi dev. Backend cần trả đúng JSON như `contracts/api.md`; trường nào lệch thì console báo "Response của … không khớp hợp đồng".

Khi triển khai bản build (`dist/`), website gọi `/api` trên cùng domain, nên cần đặt `dist/` và backend sau cùng một địa chỉ (FastAPI phục vụ file tĩnh, hoặc nginx chuyển `/api` sang backend).

## Cấu trúc

```text
src/
├── app/          router, providers, khung trang, guard phân quyền
├── features/     mỗi user story một thư mục: auth, rooms, incidents, history, nodes, accounts, audit
├── shared/       gọi API (http.ts), schema dùng chung, component giao diện, định dạng ngày giờ/số
└── mocks/        dữ liệu giả lập: db, seed, bộ mô phỏng, handler MSW
```

Màu và chữ nằm ở `src/shared/styles/theme.css`.
