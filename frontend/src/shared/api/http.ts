import type { z } from 'zod'
import { apiErrorSchema, type ApiErrorBody } from '@/shared/schemas/common'
import { ApiError, ContractError, NetworkError } from './errors'
import { clearToken, getToken } from './token'

type Listener = () => void

/**
 * Trạng thái kết nối tới máy chủ, dùng cho dải "Không kết nối được máy chủ" (edge case trong spec).
 * Ghi lại lần cuối gọi API thành công để báo "dữ liệu là của lúc ...".
 */
export const connection = (() => {
  let state = { online: true, lastSuccessAt: null as Date | null }
  const listeners = new Set<Listener>()
  const emit = () => listeners.forEach((l) => l())
  return {
    get: () => state,
    subscribe(listener: Listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    markSuccess() {
      state = { online: true, lastSuccessAt: new Date() }
      emit()
    },
    markFailure() {
      if (!state.online) return
      state = { ...state, online: false }
      emit()
    },
  }
})()

/** Phát khi API trả 401 ở bất kỳ đâu, để AuthProvider đưa người dùng về trang đăng nhập. */
const unauthorizedListeners = new Set<Listener>()
export function onUnauthorized(listener: Listener) {
  unauthorizedListeners.add(listener)
  return () => {
    unauthorizedListeners.delete(listener)
  }
}

/** Header bắt buộc của lệnh điều khiển node (ngưỡng, thử còi) theo backend. */
export const CONTROL_HEADERS: Record<string, string> = { 'X-IoT-Request': '1' }

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | string[] | null | undefined>
  headers?: Record<string, string>
  signal?: AbortSignal
}

/** Body lỗi chuẩn `{code, message}`; route cũ của backend có thể trả `{detail: "..."}`. */
function errorBody(status: number, raw: unknown): ApiErrorBody {
  const parsed = apiErrorSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  const detail = (raw as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string' && detail) return { code: `HTTP_${status}`, message: detail }
  return { code: `HTTP_${status}`, message: 'Có lỗi xảy ra.' }
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v))
    else params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * Gọi API của backend và kiểm tra response bằng schema Zod (research R4).
 * Đường dẫn luôn bắt đầu bằng /api; khi chạy dev, Vite proxy chuyển sang backend thật.
 */
export async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.infer<S>> {
  const { method = 'GET', body, query, headers: extraHeaders, signal } = options
  const headers: Record<string, string> = { ...extraHeaders }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    connection.markFailure()
    throw new NetworkError(error)
  }

  if (response.status >= 500) {
    connection.markFailure()
  } else {
    connection.markSuccess()
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearToken()
      unauthorizedListeners.forEach((l) => l())
    }
    const raw: unknown = await response.json().catch(() => null)
    throw new ApiError(response.status, errorBody(response.status, raw))
  }

  const raw: unknown = response.status === 204 ? null : await response.json()
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    console.error(`Response của ${path} không khớp hợp đồng`, parsed.error.issues)
    throw new ContractError(path, parsed.error)
  }
  return parsed.data
}
