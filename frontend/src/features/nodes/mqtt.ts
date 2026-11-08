import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { deviceKeys } from '@/features/devices/api'
import { request } from '@/shared/api/http'

// Cấp/cấp lại/thu hồi tài khoản MQTT của node qua backend (docs/LONG_API.md, mục "Cấp/thu hồi/cấp lại MQTT").
// Cấu trúc thao tác theo _public() trong backend/app/services/mqtt_lifecycle.py và bảng mqtt_operations.

export const mqttActionSchema = z.enum(['provision', 'reissue', 'revoke'])
export type MqttAction = z.infer<typeof mqttActionSchema>

export const mqttOperationSchema = z.looseObject({
  operation_id: z.string().regex(/^[0-9a-f]{32}$/),
  device_id: z.string(),
  action: mqttActionSchema,
  status: z.enum(['processing', 'succeeded', 'incomplete']),
  target_username: z.string().nullable(),
  steps: z.record(z.string(), z.string()),
  error_code: z.string().nullable(),
  message: z.string(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
})
export type MqttOperation = z.infer<typeof mqttOperationSchema>

export const mqttPasswordSchema = z
  .string()
  .min(16, 'Mật khẩu ít nhất 16 ký tự.')
  .max(128, 'Mật khẩu tối đa 128 ký tự.')

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** Mật khẩu ngẫu nhiên cho node. Bỏ phần dư để mỗi ký tự có xác suất như nhau. */
export function generateMqttPassword(length = 24): string {
  const out: string[] = []
  const limit = 256 - (256 % ALPHABET.length)
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2))
    for (const b of bytes) {
      if (b < limit && out.length < length) out.push(ALPHABET[b % ALPHABET.length]!)
    }
  }
  return out.join('')
}

export function failedSteps(op: MqttOperation): string[] {
  return Object.entries(op.steps)
    .filter(([, status]) => status === 'failed')
    .map(([name]) => name)
}

export const mqttActionLabel: Record<MqttAction, string> = {
  provision: 'Cấp tài khoản',
  reissue: 'Cấp lại',
  revoke: 'Thu hồi',
}

const base = (id: string) => `/api/devices/${encodeURIComponent(id)}`

export type CredentialRequest =
  { action: 'revoke' } | { action: 'provision' | 'reissue'; password: string }

export function useRequestCredential(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CredentialRequest) =>
      request(`${base(deviceId)}/mqtt-credentials`, mqttOperationSchema, { method: 'POST', body }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: deviceKeys.all }),
  })
}

/** Thử lại cùng thao tác. Cấp/cấp lại phải gửi đúng mật khẩu ban đầu (backend so digest). */
export function useRetryOperation(deviceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (v: { operationId: string; password?: string }) =>
      request(
        `${base(deviceId)}/mqtt-operations/${encodeURIComponent(v.operationId)}/retry`,
        mqttOperationSchema,
        { method: 'POST', body: v.password ? { password: v.password } : {} },
      ),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: deviceKeys.all }),
  })
}

export function useMqttOperation(deviceId: string, operationId: string | null) {
  return useQuery({
    queryKey: deviceKeys.operation(deviceId, operationId ?? ''),
    queryFn: ({ signal }) =>
      request(
        `${base(deviceId)}/mqtt-operations/${encodeURIComponent(operationId!)}`,
        mqttOperationSchema,
        { signal },
      ),
    enabled: !!operationId,
  })
}
