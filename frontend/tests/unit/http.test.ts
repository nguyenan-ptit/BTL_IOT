import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { uploadFirmware } from '@/features/nodes/ota'
import { ApiError } from '@/shared/api/errors'
import { CONTROL_HEADERS, onUnauthorized, request } from '@/shared/api/http'
import { clearToken, getToken, setToken } from '@/shared/api/token'

const fetchMock = vi.fn()

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function lastInit(): RequestInit {
  return fetchMock.mock.calls.at(-1)![1] as RequestInit
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  clearToken()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('request() với Bearer token', () => {
  it('gắn Authorization khi có token', async () => {
    setToken('abc')
    fetchMock.mockResolvedValue(jsonResponse(200, {}))
    await request('/api/x', z.object({}))
    const init = lastInit()
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer abc')
    expect(init.credentials).toBeUndefined()
  })

  it('không gắn Authorization khi chưa đăng nhập', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))
    await request('/api/x', z.object({}))
    expect(new Headers(lastInit().headers).has('Authorization')).toBe(false)
  })

  it('401 thì xoá token và báo onUnauthorized', async () => {
    setToken('het-han')
    const listener = vi.fn()
    const off = onUnauthorized(listener)
    fetchMock.mockResolvedValue(
      jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Vui lòng đăng nhập lại.' }),
    )
    const error = await request('/api/x', z.object({})).catch((e: unknown) => e)
    off()
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('UNAUTHENTICATED')
    expect(getToken()).toBeNull()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('lỗi dạng detail chuỗi thì dùng chuỗi đó làm message', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(503, { detail: 'Không truy cập được cơ sở dữ liệu; hãy thử lại.' }),
    )
    const error = (await request('/api/x', z.object({})).catch((e: unknown) => e)) as ApiError
    expect(error.message).toBe('Không truy cập được cơ sở dữ liệu; hãy thử lại.')
    expect(error.code).toBe('HTTP_503')
  })

  it('gửi kèm header tuỳ chọn', async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, {}))
    await request('/api/x', z.object({}), {
      method: 'POST',
      body: { a: 1 },
      headers: CONTROL_HEADERS,
    })
    const headers = new Headers(lastInit().headers)
    expect(headers.get('X-IoT-Request')).toBe('1')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('gửi nguyên bytes và manifest khi upload firmware', async () => {
    const file = new File([new Uint8Array([0xe9, 0x00, 0xff])], 'node.bin')
    const value = `node10:v1.0.1:${'a'.repeat(64)}:${'b'.repeat(512)}`
    const manifest = new File([`${value}\n`], 'node.manifest')
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        firmware_id: 'release',
        device_id: 'node10',
        version: 'v1.0.1',
        size_bytes: 3,
        created_at: '',
      }),
    )
    await uploadFirmware('node10', 'v1.0.1', file, manifest)
    expect(fetchMock.mock.calls.at(-1)![0]).toBe('/api/firmware?device_id=node10&version=v1.0.1')
    expect(lastInit().body).toBe(file)
    const headers = new Headers(lastInit().headers)
    expect(headers.get('Content-Type')).toBe('application/octet-stream')
    expect(headers.get('X-IoT-Firmware-Manifest')).toBe(value)
  })
})
