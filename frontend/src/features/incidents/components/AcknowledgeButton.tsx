import { Stamp as StampIcon } from 'lucide-react'
import { useState } from 'react'
import { isApiError } from '@/shared/api/errors'
import { Button, type ButtonProps } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { useAcknowledge } from '../hooks'
import type { Incident } from '../schemas'

/**
 * Nút "Tiếp nhận" có bước xác nhận (FR-014). Ẩn khi người dùng đã tiếp nhận hoặc sự cố đã kết thúc.
 * `onAcknowledged` báo cho nơi gọi để chạy hiệu ứng đóng dấu một lần.
 */
export function AcknowledgeButton({
  incident,
  size = 'md',
  variant = 'stamp',
  className,
  onAcknowledged,
}: {
  incident: Incident
  size?: ButtonProps['size']
  variant?: 'stamp' | 'stampOnAlarm'
  className?: string
  onAcknowledged?: () => void
}) {
  const [open, setOpen] = useState(false)
  const acknowledge = useAcknowledge()

  const resolved = incident.status === 'resolved'
  const hidden = resolved || incident.acknowledgedByMe

  let error: string | null = null
  if (acknowledge.error) {
    error = isApiError(acknowledge.error, 'INCIDENT_ALREADY_RESOLVED')
      ? 'Sự cố đã kết thúc trước khi bạn tiếp nhận. Không cần làm gì thêm.'
      : 'Chưa gửi được. Kiểm tra mạng rồi bấm lại.'
  }

  if (hidden && !open && !error) return null

  return (
    <>
      {!hidden && (
        <Button
          variant={variant}
          size={size}
          className={className}
          onClick={() => {
            acknowledge.reset()
            setOpen(true)
          }}
        >
          <StampIcon aria-hidden className="size-4" />
          Tiếp nhận
        </Button>
      )}
      <ConfirmDialog
        open={open}
        title={
          resolved
            ? `Sự cố phòng ${incident.roomName} vừa kết thúc`
            : `Tiếp nhận sự cố phòng ${incident.roomName}?`
        }
        confirmLabel={resolved ? 'Đóng' : 'Tiếp nhận'}
        confirmVariant={resolved ? 'secondary' : 'stamp'}
        loading={acknowledge.isPending}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          resolved
            ? setOpen(false)
            : acknowledge.mutate(incident.id, {
                onSuccess: () => {
                  setOpen(false)
                  onAcknowledged?.()
                },
                onError: (e) => {
                  if (isApiError(e, 'INCIDENT_ALREADY_RESOLVED')) setOpen(false)
                },
              })
        }
      >
        {resolved ? (
          <p>
            Số đo đã về bình thường ổn định trong lúc bạn đang xác nhận, nên không cần tiếp nhận
            nữa.
          </p>
        ) : (
          <p>
            Hệ thống ghi tên bạn là người đã biết và đang xử lý, đồng thời dừng nhắc lặp cho bạn. Sự
            cố vẫn được theo dõi cho đến khi số đo về bình thường.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 font-medium text-alarm-deep">
            {error}
          </p>
        )}
      </ConfirmDialog>
      {error && !open && (
        <p role="alert" className="text-sm font-medium text-alarm-deep">
          {error}
        </p>
      )}
    </>
  )
}
