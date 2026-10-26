import type { ApiErrorBody } from '@/shared/schemas/common'

/** Lỗi từ API. Giao diện xử lý theo `code`, không so khớp `message` (contracts/api.md). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Record<string, string> | undefined

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.fields = body.fields
  }
}

/** Không gọi được máy chủ (mất mạng, máy chủ tắt). */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Không kết nối được máy chủ.', { cause })
    this.name = 'NetworkError'
  }
}

/** Response không khớp hợp đồng. Thường do backend đổi trường mà frontend chưa cập nhật schema. */
export class ContractError extends Error {
  readonly path: string

  constructor(path: string, cause: unknown) {
    super(`Dữ liệu từ ${path} không đúng định dạng.`, { cause })
    this.name = 'ContractError'
    this.path = path
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code)
}
