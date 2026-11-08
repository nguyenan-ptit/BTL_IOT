import { BellRing, Square } from 'lucide-react'
import { controlBlockReason } from '@/features/devices/adapters'
import type { DeviceItem } from '@/features/devices/schemas'
import { isApiError } from '@/shared/api/errors'
import { Button } from '@/shared/ui/Button'
import { useBuzzerTest } from '../api'

/** Thử còi và đèn đỏ khoảng 3 giây trên node; "Dừng" chỉ dừng lượt thử, không tắt cảnh báo thật. */
export function BuzzerTestButton({ item }: { item: DeviceItem }) {
  const test = useBuzzerTest()
  const running = item.buzzer_control.pending?.status === 'running'
  const blocked = controlBlockReason(item, 'buzzer')
  const data = item.data

  return (
    <div className="flex flex-col items-start gap-1">
      {running ? (
        <Button
          variant="secondary"
          size="sm"
          loading={test.isPending}
          disabled={!data}
          onClick={() => data && test.mutate({ deviceId: item.device_id, data, action: 'stop' })}
        >
          <Square aria-hidden className="size-4" />
          Dừng thử còi
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          loading={test.isPending}
          disabled={!data || blocked !== null}
          title={blocked ?? undefined}
          onClick={() => data && test.mutate({ deviceId: item.device_id, data, action: 'start' })}
        >
          <BellRing aria-hidden className="size-4" />
          Thử còi và đèn
        </Button>
      )}
      {test.error && (
        <p role="alert" className="text-sm font-medium text-alarm-deep">
          {isApiError(test.error) ? test.error.message : 'Chưa gửi được lệnh thử còi.'}
        </p>
      )}
    </div>
  )
}
