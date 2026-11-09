import { Building2, Cpu, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { useUsers } from '@/features/accounts/hooks'
import { useDevices } from '@/features/devices/hooks'
import { LifecyclePill } from '@/features/nodes/components/NodeBadges'
import { RegisterNodeForm } from '@/features/nodes/components/RegisterNodeForm'
import { useBoardingHouses, useRooms } from '@/features/rooms/hooks'
import type { BoardingHouse, Room } from '@/features/rooms/schemas'
import { roomNumber } from '@/shared/lib/labels'
import { Button } from '@/shared/ui/Button'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { FormDialog } from '@/shared/ui/FormDialog'
import { Sheet } from '@/shared/ui/Sheet'
import { HouseFormDialog } from '../components/HouseFormDialog'
import { RoomFormDialog } from '../components/RoomFormDialog'
import { roomsWithNodes } from '../schemas'

/**
 * Nhà trọ & phòng (admin): nhà trọ → phòng → node đang gắn.
 * Phòng là nơi ở và có trước; node là thiết bị, tạo sau rồi gắn vào phòng.
 */
export default function HousesPage() {
  const houses = useBoardingHouses()
  const rooms = useRooms()
  const devices = useDevices({ refetchInterval: 10_000 })
  const landlords = useUsers({ q: null, role: 'landlord', locked: null, page: 1 })
  const [addingHouse, setAddingHouse] = useState(false)
  const [roomFor, setRoomFor] = useState<BoardingHouse | null>(null)
  const [nodeFor, setNodeFor] = useState<Room | null>(null)

  const landlordList = landlords.data?.items ?? []
  const landlordName = (id: string | null) => {
    const user = landlordList.find((u) => u.id === id)
    return user ? user.displayName || user.username : id ? `Tài khoản #${id}` : 'Chưa có chủ trọ'
  }
  const nodesByRoom = roomsWithNodes(devices.data ?? [])
  const allRooms = rooms.data ?? []
  const roomsWithNode = allRooms.filter((r) => nodesByRoom.has(r.id)).length

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Nhà trọ &amp; phòng</h1>
          <p className="text-sm text-ink-soft">
            {houses.data
              ? `${houses.data.length} nhà trọ · ${allRooms.length} phòng · ${roomsWithNode} phòng có node`
              : 'Đang tải…'}
          </p>
        </div>
        <Button onClick={() => setAddingHouse(true)}>
          <Plus aria-hidden className="size-4" />
          Thêm nhà trọ
        </Button>
      </header>

      <DataState
        query={houses}
        isEmpty={(data) => data.length === 0}
        skeleton={<Skeleton className="h-48" />}
        empty={
          <EmptyState title="Chưa có nhà trọ nào">
            Tạo tài khoản chủ trọ ở trang Tài khoản, rồi bấm "Thêm nhà trọ" để giao nhà trọ cho chủ
            trọ đó.
          </EmptyState>
        }
      >
        {(list) => (
          <ul className="flex flex-col gap-4">
            {list.map((house) => {
              const houseRooms = allRooms.filter((r) => r.boardingHouseId === house.id)
              return (
                <li key={house.id}>
                  <Sheet className="flex flex-col gap-3 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <Building2 aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-soft" />
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-bold">{house.name}</h2>
                          <p className="text-sm text-ink-soft">
                            Chủ trọ: {landlordName(house.landlordId)} · {houseRooms.length} phòng
                          </p>
                        </div>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => setRoomFor(house)}>
                        <Plus aria-hidden className="size-4" />
                        Thêm phòng
                      </Button>
                    </div>

                    {houseRooms.length === 0 ? (
                      <p className="rounded-[4px] bg-ground px-3 py-2.5 text-sm text-ink-soft">
                        Chưa có phòng. Bấm "Thêm phòng".
                      </p>
                    ) : (
                      <ul className="flex flex-col divide-y divide-rule rounded-[var(--radius-sheet)] border border-rule">
                        {houseRooms.map((room) => {
                          const nodes = nodesByRoom.get(room.id) ?? []
                          return (
                            <li
                              key={room.id}
                              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold">Phòng {roomNumber(room.name)}</p>
                                <p className="tabular text-xs text-ink-soft">Mã {room.id}</p>
                              </div>
                              {nodes.length > 0 ? (
                                <ul className="flex flex-wrap items-center gap-2">
                                  {nodes.map((node) => (
                                    <li key={node.device_id}>
                                      <Link
                                        to={`/quan-tri/node/${encodeURIComponent(node.device_id)}`}
                                        className="inline-flex items-center gap-2 rounded-full py-0.5 pr-0.5 pl-2 text-sm font-semibold hover:bg-board-100"
                                      >
                                        <Cpu aria-hidden className="size-4 text-ink-soft" />
                                        {node.device_id}
                                        <LifecyclePill lifecycle={node.lifecycle_status} />
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <span className="text-sm text-ink-faint">Chưa có node</span>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setNodeFor(room)}
                                  >
                                    <Plus aria-hidden className="size-4" />
                                    Thêm node
                                  </Button>
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </Sheet>
                </li>
              )
            })}
          </ul>
        )}
      </DataState>

      <HouseFormDialog
        open={addingHouse}
        landlords={landlordList}
        onClose={() => setAddingHouse(false)}
      />
      <RoomFormDialog house={roomFor} onClose={() => setRoomFor(null)} />
      <FormDialog
        open={nodeFor !== null}
        title={`Thêm node · Phòng ${nodeFor ? roomNumber(nodeFor.name) : ''}`}
        onClose={() => setNodeFor(null)}
      >
        {nodeFor && (
          <div className="p-5">
            <RegisterNodeForm
              key={nodeFor.id}
              presetRoomId={nodeFor.id}
              onDone={() => setNodeFor(null)}
            />
          </div>
        )}
      </FormDialog>
    </div>
  )
}
