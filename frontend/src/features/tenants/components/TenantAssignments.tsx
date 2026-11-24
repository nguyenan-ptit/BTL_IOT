import { useId, useState } from 'react'
import { RoomOptions } from '@/features/rooms/components/RoomOptions'
import type { HouseGroup } from '@/features/rooms/group'
import { isApiError } from '@/shared/api/errors'
import { roomNumber } from '@/shared/lib/labels'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { Field, inputClass } from '@/shared/ui/Field'
import { FormDialog } from '@/shared/ui/FormDialog'
import { Sheet } from '@/shared/ui/Sheet'
import { useTenantAssignments, useUpdateTenantAssignment } from '../api'
import type { TenantAssignment } from '../schemas'

type RoomGroups = HouseGroup<{ id: string; name: string }>[]

export function TenantAssignments({ groups }: { groups: RoomGroups }) {
  const tenants = useTenantAssignments()
  const update = useUpdateTenantAssignment()
  const [action, setAction] = useState<{ kind: 'move' | 'end'; tenant: TenantAssignment } | null>(
    null,
  )
  const [destination, setDestination] = useState('')
  const [message, setMessage] = useState('')
  const destinationId = useId()
  const error = update.error
    ? isApiError(update.error)
      ? update.error.message
      : 'Chưa cập nhật được. Vui lòng thử lại.'
    : null

  function open(kind: 'move' | 'end', tenant: TenantAssignment) {
    update.reset()
    setMessage('')
    setDestination('')
    setAction({ kind, tenant })
  }

  function close() {
    if (!update.isPending) setAction(null)
  }

  function save(roomId: string | null) {
    if (!action || update.isPending) return
    update.mutate(
      { assignmentId: action.tenant.assignment_id, roomId },
      {
        onSuccess: ({ message }) => {
          setAction(null)
          setMessage(message)
        },
      },
    )
  }

  const otherRooms = groups
    .map((group) => ({
      ...group,
      rooms: group.rooms.filter((room) => room.id !== action?.tenant.room_id),
    }))
    .filter((group) => group.rooms.length > 0)
  const errorMessage = error && (
    <p role="alert" className="text-sm text-alarm-deep">
      {error}
    </p>
  )

  return (
    <Sheet className="flex flex-col gap-3 p-4 sm:p-5">
      <h2 className="text-lg font-bold">Người thuê đang ở</h2>
      {message && (
        <p role="status" className="text-sm text-normal-ink">
          {message}
        </p>
      )}
      <DataState
        query={tenants}
        isEmpty={(items) => items.length === 0}
        skeleton={<Skeleton className="h-24" />}
        empty={<EmptyState title="Chưa có người thuê đang ở" />}
      >
        {(items) => (
          <ul className="divide-y divide-rule border-y border-rule">
            {items.map((tenant) => (
              <li
                key={tenant.assignment_id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold break-words">
                    {tenant.display_name || tenant.username}
                  </p>
                  <p className="text-sm break-words text-ink-soft">
                    {tenant.house_name} · Phòng {roomNumber(tenant.room_name)}
                  </p>
                  {tenant.display_name && (
                    <p className="text-xs break-words text-ink-soft">{tenant.username}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => open('move', tenant)}
                    disabled={
                      !groups.some((group) =>
                        group.rooms.some((room) => room.id !== tenant.room_id),
                      )
                    }
                  >
                    Chuyển phòng
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => open('end', tenant)}>
                    Kết thúc thuê
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DataState>

      <FormDialog open={action?.kind === 'move'} title="Chuyển phòng" onClose={close}>
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (destination) save(destination)
          }}
        >
          <p className="text-sm text-ink-soft">
            {action?.tenant.display_name || action?.tenant.username} sẽ mất quyền xem phòng cũ và
            được cấp quyền xem phòng mới.
          </p>
          <Field id={destinationId} label="Phòng mới">
            <select
              id={destinationId}
              className={inputClass}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              disabled={update.isPending}
            >
              <option value="">Chọn phòng</option>
              <RoomOptions groups={otherRooms} />
            </select>
          </Field>
          {errorMessage}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={update.isPending}>
              Hủy
            </Button>
            <Button type="submit" disabled={!destination} loading={update.isPending}>
              Chuyển phòng
            </Button>
          </div>
        </form>
      </FormDialog>

      <ConfirmDialog
        open={action?.kind === 'end'}
        title="Kết thúc thuê"
        confirmLabel="Kết thúc thuê"
        confirmVariant="danger"
        loading={update.isPending}
        onCancel={close}
        onConfirm={() => save(null)}
      >
        {action?.kind === 'end' && (
          <p className="text-sm">
            {action.tenant.display_name || action.tenant.username} sẽ mất quyền xem dữ liệu của{' '}
            {action.tenant.house_name} · Phòng {roomNumber(action.tenant.room_name)}.
          </p>
        )}
        {errorMessage}
      </ConfirmDialog>
    </Sheet>
  )
}
