export const LOGIN_PATH = '/dang-nhap'

/** Chỉ cho phép quay về đường dẫn nội bộ, tránh chuyển hướng ra trang ngoài. */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}
