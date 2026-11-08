// Access token Bearer do POST /api/auth/login trả về.
// Lưu trong sessionStorage: F5 không mất đăng nhập, đóng tab thì hết. Storage có thể bị chặn
// (chế độ riêng tư, iframe) nên mọi truy cập đều bọc try/catch và coi như chưa đăng nhập.
const KEY = 'btl-iot.token'

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(KEY, token)
  } catch {
    // Không lưu được thì người dùng phải đăng nhập lại sau khi tải lại trang.
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Bỏ qua: không có gì để xoá.
  }
}
