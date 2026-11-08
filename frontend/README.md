# Frontend: website giám sát cháy/gas nhà trọ

React 19 + TypeScript + Tailwind CSS 4, Zod, nuqs, TanStack Query, React Router, chạy bằng Vite. Đặc tả nằm ở `specs/001-web-giam-sat-canh-bao/`.

Website gọi backend FastAPI/MySQL trong `backend/` (xem [API backend](../docs/LONG_API.md) và Swagger `http://<máy-backend>:8000/docs`). Không còn chế độ dữ liệu giả lập.

## Yêu cầu

- Node.js 22 trở lên (đã thử với 24.21), npm 10 trở lên.
- Một backend đang chạy. Cách dựng backend trên Windows: [RUN_BACKEND_WINDOWS](../docs/RUN_BACKEND_WINDOWS.md).

## Chạy lần đầu

```powershell
cd frontend
npm install
copy .env.example .env.local     # macOS/Linux: cp .env.example .env.local
npm run dev
```

Trong `.env.local`, đặt `VITE_API_BASE_URL` là địa chỉ backend (mặc định `http://127.0.0.1:8000`). Mở http://localhost:5173 rồi đăng nhập bằng tài khoản có trong MySQL của backend.

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

## Gọi backend

- Đăng nhập trả token Bearer; website lưu token trong `sessionStorage` của tab (F5 vẫn còn, đóng tab thì phải đăng nhập lại) và gắn `Authorization: Bearer …` vào mọi request.
- Khi dev, Vite chuyển mọi request `/api` sang `VITE_API_BASE_URL` (proxy) và bỏ header `Origin`, vì lệnh điều khiển node của backend (ngưỡng, thử còi) chỉ nhận Origin trùng địa chỉ backend.
- Route của Vĩ (`/api/auth`, `/api/rooms`, `/api/incidents`, `/api/users`, `/api/audit-logs`) dùng thẳng. Route của Long (`/api/devices*`, `/api/history`) được chuyển sang kiểu dữ liệu của website trong `src/features/devices/`.
- Trường nào lệch, console báo "Response của … không khớp hợp đồng".

Khi triển khai bản build (`dist/`), website gọi `/api` trên cùng domain, nên cần đặt `dist/` và backend sau cùng một địa chỉ (FastAPI phục vụ file tĩnh, hoặc nginx chuyển `/api` sang backend).

## Cấu trúc

```text
src/
├── app/          router, providers, khung trang, guard phân quyền
├── features/     mỗi user story một thư mục: auth, rooms, incidents, history, nodes, thresholds, accounts, audit;
│                 devices/ chuyển dữ liệu /api/devices, /api/history của backend
└── shared/       gọi API (http.ts, token.ts), schema dùng chung, component giao diện, định dạng ngày giờ/số
```

Màu và chữ nằm ở `src/shared/styles/theme.css`.
