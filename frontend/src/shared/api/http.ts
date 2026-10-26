import type { z } from 'zod'
import { apiErrorSchema } from '@/shared/schemas/common'
import { ApiError, ContractError, NetworkError } from './errors'

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

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | string[] | null | undefined>
  signal?: AbortSignal
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
  const { method = 'GET', body, query, signal } = options
  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
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
    if (response.status === 401) unauthorizedListeners.forEach((l) => l())
    const raw: unknown = await response.json().catch(() => null)
    const parsed = apiErrorSchema.safeParse(raw)
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data : { code: `HTTP_${response.status}`, message: 'Có lỗi xảy ra.' },
    )
  }

  const raw: unknown = response.status === 204 ? null : await response.json()
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    console.error(`Response của ${path} không khớp hợp đồng`, parsed.error.issues)
    throw new ContractError(path, parsed.error)
  }
  return parsed.data
}
