import { roomNumber } from '@/shared/lib/labels'
import type { HouseGroup } from '../group'

/** Các <option> phòng nhóm theo nhà, mỗi lựa chọn ghi "Nhà · Phòng" để không lẫn phòng trùng tên. */
export function RoomOptions({ groups }: { groups: HouseGroup<{ id: string; name: string }>[] }) {
  return groups.map((group) => (
    <optgroup key={group.id} label={group.name}>
      {group.rooms.map((room) => (
        <option key={room.id} value={room.id}>
          {group.name} · Phòng {roomNumber(room.name)}
        </option>
      ))}
    </optgroup>
  ))
}
