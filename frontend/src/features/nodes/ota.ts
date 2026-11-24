import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { ApiError } from '@/shared/api/errors'
import { CONTROL_HEADERS, request } from '@/shared/api/http'

const releaseSchema = z.object({
  firmware_id: z.string(),
  device_id: z.string(),
  version: z.string(),
  size_bytes: z.number().int(),
  created_at: z.string(),
})

const jobSchema = z.object({
  job_id: z.string(),
  device_id: z.string(),
  firmware_id: z.string(),
  target_version: z.string(),
  firmware_version: z.string(),
  status: z.enum([
    'queued',
    'pending',
    'downloading',
    'installing',
    'succeeded',
    'failed',
    'timeout',
  ]),
  progress: z.number().int().min(0).max(100),
  error_code: z.string().nullable(),
  requested_at: z.string(),
})

const overviewSchema = z.object({
  enabled: z.boolean(),
  mqtt_ready: z.boolean(),
  job: jobSchema.nullable(),
})

export type OtaJob = z.infer<typeof jobSchema>
export const otaKey = (deviceId: string) => ['ota', deviceId] as const
export const releaseKey = (deviceId: string) => ['firmware', deviceId] as const
const path = (deviceId: string) => `/api/devices/${encodeURIComponent(deviceId)}/ota`

export function isUpdating(job: OtaJob | null | undefined) {
  return !!job && ['queued', 'pending', 'downloading', 'installing'].includes(job.status)
}

export function useOtaOverview(deviceId: string) {
  return useQuery({
    queryKey: otaKey(deviceId),
    queryFn: ({ signal }) => request(path(deviceId), overviewSchema, { signal }),
    enabled: !!deviceId,
    refetchInterval: ({ state }) => (isUpdating(state.data?.job) ? 2_000 : 10_000),
  })
}

export function useFirmwareReleases(deviceId: string, enabled: boolean) {
  return useQuery({
    queryKey: releaseKey(deviceId),
    queryFn: async ({ signal }) =>
      (
        await request('/api/firmware', z.object({ items: z.array(releaseSchema) }), {
          signal,
          query: { device_id: deviceId },
        })
      ).items,
    enabled,
  })
}

export async function uploadFirmware(
  deviceId: string,
  version: string,
  file: File,
  manifest: File,
) {
  const signedManifest = (await manifest.text()).trim()
  if (!/^[A-Za-z0-9._:-]{1,1024}$/.test(signedManifest)) {
    throw new ApiError(422, {
      code: 'VALIDATION_ERROR',
      message: 'Định dạng manifest firmware không hợp lệ.',
    })
  }
  return request('/api/firmware', releaseSchema, {
    method: 'POST',
    body: file,
    headers: { ...CONTROL_HEADERS, 'X-IoT-Firmware-Manifest': signedManifest },
    query: { device_id: deviceId, version },
  })
}

export function startOta(deviceId: string, firmwareId: string) {
  return request(path(deviceId), jobSchema, {
    method: 'POST',
    headers: CONTROL_HEADERS,
    body: { firmware_id: firmwareId },
  })
}
