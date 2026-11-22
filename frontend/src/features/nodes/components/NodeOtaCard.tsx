import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent } from 'react'
import type { DeviceItem } from '@/features/devices/schemas'
import { isApiError } from '@/shared/api/errors'
import { formatDateTime } from '@/shared/lib/datetime'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { inputClass } from '@/shared/ui/Field'
import { Sheet } from '@/shared/ui/Sheet'
import {
  isUpdating,
  otaKey,
  releaseKey,
  startOta,
  uploadFirmware,
  useFirmwareReleases,
  type OtaJob,
  type useOtaOverview,
} from '../ota'

const labels: Record<OtaJob['status'], string> = {
  queued: 'Đang chờ gửi lệnh',
  pending: 'Đang chờ node phản hồi',
  downloading: 'Node đang tải firmware',
  installing: 'Đang cài đặt và chờ node khởi động lại',
  succeeded: 'Cập nhật thành công',
  failed: 'Cập nhật thất bại',
  timeout: 'Quá hạn chờ node xác nhận',
}

const errorLabels: Record<string, string> = {
  alarm_active: 'Node đang báo động.',
  device_busy: 'Node đang thử còi hoặc đổi Wi-Fi.',
  already_on_version: 'Node đang chạy phiên bản đã chọn.',
  invalid_url: 'Địa chỉ tải không khớp cấu hình của node.',
  insufficient_flash: 'Node không đủ bộ nhớ flash cho bản mới.',
  clock_not_ready: 'Node chưa đồng bộ được thời gian.',
  connection_lost: 'Node mất kết nối trong lúc cập nhật.',
  download_failed: 'Node không tải được bản firmware.',
  download_timeout: 'Quá thời hạn tải firmware.',
  download_interrupted: 'Kết nối tải firmware bị gián đoạn.',
  checksum_mismatch: 'Mã kiểm tra file không khớp.',
  invalid_image: 'File tải về không phải firmware ESP8266 hợp lệ.',
  invalid_signature: 'Node từ chối chữ ký của firmware.',
  size_mismatch: 'Kích thước file tải về không khớp.',
  flash_error: 'Node gặp lỗi khi ghi firmware vào flash.',
  storage_error: 'Node không lưu được mã cập nhật để báo lại sau khi khởi động.',
  version_mismatch: 'Sau khi khởi động, phiên bản node báo về không khớp.',
  device_unavailable: 'Node không còn ở trạng thái cho phép cập nhật.',
  dispatch_expired: 'Lệnh đã hết hạn trước khi gửi được tới broker.',
  timeout: 'BE chưa nhận được xác nhận cuối từ node.',
}

function errorText(error: unknown) {
  return isApiError(error) ? error.message : 'Không thực hiện được. Hãy thử lại.'
}

export function NodeOtaCard({
  item,
  overview,
}: {
  item: DeviceItem
  overview: ReturnType<typeof useOtaOverview>
}) {
  const deviceId = item.device_id
  const client = useQueryClient()
  const releases = useFirmwareReleases(deviceId, overview.data?.enabled === true)
  const fileInput = useRef<HTMLInputElement>(null)
  const [version, setVersion] = useState('')
  const [file, setFile] = useState<File>()
  const [error, setError] = useState('')
  const [selected, setSelected] = useState('')
  const [confirm, setConfirm] = useState(false)
  const job = overview.data?.job
  const updating = isUpdating(job)
  const selectedRelease = releases.data?.find((release) => release.firmware_id === selected)

  const upload = useMutation({
    mutationFn: ({ version, file }: { version: string; file: File }) =>
      uploadFirmware(deviceId, version, file),
    onSuccess: (release) => {
      setSelected(release.firmware_id)
      setVersion('')
      setFile(undefined)
      if (fileInput.current) fileInput.current.value = ''
      void client.invalidateQueries({ queryKey: releaseKey(deviceId) })
    },
  })
  const start = useMutation({
    mutationFn: (firmwareId: string) => startOta(deviceId, firmwareId),
    onSuccess: (newJob) => {
      client.setQueryData(otaKey(deviceId), { enabled: true, mqtt_ready: true, job: newJob })
      setConfirm(false)
      void client.invalidateQueries({ queryKey: otaKey(deviceId) })
    },
  })

  function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    upload.reset()
    const value = version.trim()
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(value)) {
      return setError('Phiên bản chỉ dùng chữ, số, dấu chấm, gạch ngang và gạch dưới.')
    }
    if (!file || !/\.bin$/i.test(file.name) || file.size > 1024 * 1024) {
      return setError('Chọn file .bin đã ký, dung lượng tối đa 1 MiB.')
    }
    upload.mutate({ version: value, file })
  }

  const unavailable = !overview.data?.mqtt_ready
    ? 'BE chưa kết nối được topic OTA.'
    : !item.can_control || !item.online
      ? 'Node cần online và ở trạng thái cho phép điều khiển.'
      : item.data?.ota_supported !== true
        ? 'Firmware đang chạy chưa báo hỗ trợ OTA.'
        : item.data.system_state === 'alarm' || item.data.buzzer_test?.active
          ? 'Node đang báo động hoặc thử còi.'
          : null

  return (
    <Sheet className="flex flex-col gap-4 p-4 sm:p-5">
      <h2 className="font-bold">Cập nhật firmware</h2>
      {overview.isPending && <p className="text-sm text-ink-soft">Đang kiểm tra OTA…</p>}
      {overview.isError && (
        <p role="alert" className="text-sm text-alarm-deep">
          {errorText(overview.error)}
        </p>
      )}
      {overview.data?.enabled === false && (
        <p className="text-sm text-ink-soft">Backend chưa cấu hình OTA.</p>
      )}
      {overview.data?.enabled && (
        <>
          {job && (
            <div className="flex flex-col gap-2 rounded-lg border border-rule p-3" role="status">
              <span className="font-semibold">{labels[job.status]}</span>
              <p className="text-sm text-ink-soft">
                Bản đích {job.target_version} · {formatDateTime(job.requested_at)}
              </p>
              {updating && (
                <div className="flex items-center gap-2">
                  <progress
                    className="w-full"
                    max={100}
                    value={job.progress}
                    aria-label="Tiến độ OTA"
                  />
                  <span className="tabular text-sm">{job.progress}%</span>
                </div>
              )}
              {job.status === 'succeeded' && (
                <p className="text-sm">Node đang chạy {job.firmware_version}.</p>
              )}
              {job.error_code && (
                <p className="text-sm text-alarm-deep">
                  {errorLabels[job.error_code] ?? job.error_code}
                </p>
              )}
            </div>
          )}
          {item.lifecycle_status !== 'decommissioned' && (
            <>
              <form onSubmit={onUpload} className="flex flex-col gap-2">
                <label htmlFor="ota-version" className="text-sm font-semibold">
                  Phiên bản mới
                </label>
                <input
                  id="ota-version"
                  className={inputClass}
                  value={version}
                  maxLength={64}
                  onChange={(event) => setVersion(event.target.value)}
                  placeholder="v1.0.1"
                  required
                />
                <label htmlFor="ota-file" className="text-sm font-semibold">
                  File firmware đã ký
                </label>
                <input
                  id="ota-file"
                  ref={fileInput}
                  className={inputClass}
                  type="file"
                  accept=".bin"
                  required
                  onChange={(event) => setFile(event.target.files?.[0])}
                />
                <Button type="submit" variant="secondary" loading={upload.isPending}>
                  Tải lên
                </Button>
                {(error || upload.error) && (
                  <p role="alert" className="text-sm text-alarm-deep">
                    {error || errorText(upload.error)}
                  </p>
                )}
              </form>
              <label htmlFor="ota-release" className="text-sm font-semibold">
                Bản firmware của node
              </label>
              <select
                id="ota-release"
                className={inputClass}
                value={selected}
                onChange={(event) => {
                  setSelected(event.target.value)
                  start.reset()
                }}
              >
                <option value="">Chọn bản đã tải lên</option>
                {releases.data?.map((release) => (
                  <option key={release.firmware_id} value={release.firmware_id}>
                    {release.version} · {Math.ceil(release.size_bytes / 1024)} KiB
                  </option>
                ))}
              </select>
              {releases.isError && (
                <p role="alert" className="text-sm text-alarm-deep">
                  {errorText(releases.error)}
                </p>
              )}
              {unavailable && !updating && <p className="text-sm text-ink-soft">{unavailable}</p>}
              <Button
                disabled={
                  !!unavailable ||
                  updating ||
                  !selectedRelease ||
                  selectedRelease.version === item.device.firmware_version
                }
                onClick={() => {
                  start.reset()
                  setConfirm(true)
                }}
              >
                Cập nhật node
              </Button>
            </>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirm}
        title={`Cập nhật ${deviceId} lên ${selectedRelease?.version ?? ''}?`}
        confirmLabel="Cập nhật"
        loading={start.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          if (selectedRelease) start.mutate(selectedRelease.firmware_id)
        }}
      >
        <p>Node có thể tạm ngừng gửi số đo và sẽ khởi động lại sau khi cài đặt.</p>
        {start.error && (
          <p role="alert" className="text-sm text-alarm-deep">
            {errorText(start.error)}
          </p>
        )}
      </ConfirmDialog>
    </Sheet>
  )
}
