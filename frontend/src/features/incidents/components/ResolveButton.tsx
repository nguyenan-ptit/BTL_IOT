import { CircleCheck } from 'lucide-react'
import { useState } from 'react'
import { usePermission } from '@/features/auth/hooks'
import { isApiError } from '@/shared/api/errors'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { useResolveIncident } from '../hooks'
import { canResolve, type Incident } from '../schemas'

/** Đóng sự cố sau khi cảm biến báo đã khôi phục (người thuê/chủ trọ của phòng). */
export function ResolveButton({ incident }: { incident: Incident }) {
  const allowed = usePermission('incidents:acknowledge')
  const resolve = useResolveIncident()
  const [open, setOpen] = useState(false)

  if (!allowed || !canResolve(incident)) return null

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        onClick={() => {
          resolve.reset()
          setOpen(true)
        }}
      >
        <CircleCheck aria-hidden className="size-5" />
        Đóng sự cố
      </Button>
      {resolve.error && !open && (
        <p role="alert" className="text-sm font-medium text-alarm-deep">
          {isApiError(resolve.error) ? resolve.error.message : 'Chưa đóng được. Thử lại sau.'}
        </p>
      )}
      <ConfirmDialog
        open={open}
        title="Đóng sự cố này?"
        confirmLabel="Đóng sự cố"
        loading={resolve.isPending}
        onCancel={() => setOpen(false)}
        onConfirm={() => resolve.mutate(incident.id, { onSettled: () => setOpen(false) })}
      >
        <p>Cảm biến đã báo về bình thường. Đóng sự cố để xác nhận đã xử lý xong tại phòng.</p>
      </ConfirmDialog>
    </div>
  )
}
