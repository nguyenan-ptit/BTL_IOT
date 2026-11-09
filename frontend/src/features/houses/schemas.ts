import { z } from 'zod'
import type { DeviceItem } from '@/features/devices/schemas'

// Form thêm nhà trọ và phòng; ràng buộc theo backend/app/schemas/rooms.py.
export const houseFormSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên nhà trọ.').max(100, 'Tên nhà trọ tối đa 100 ký tự.'),
  address: z
    .string()
    .trim()
    .max(255, 'Địa chỉ tối đa 255 ký tự.')
    .transform((v) => v || undefined),
  landlordId: z.string().min(1, 'Chọn chủ trọ.'),
})
export type HouseFormInput = z.input<typeof houseFormSchema>
export type HouseForm = z.output<typeof houseFormSchema>

export const roomFormSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên phòng.').max(50, 'Tên phòng tối đa 50 ký tự.'),
  id: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,20}$/, 'Mã phòng gồm 1–20 ký tự chữ, số, gạch dưới hoặc gạch ngang.'),
})
export type RoomForm = z.infer<typeof roomFormSchema>

/**
 * Mã phòng gợi ý: "n{mã nhà trọ}-{số trong tên}". Mã phòng phải duy nhất trên toàn hệ thống,
 * nên ghép mã nhà trọ để hai nhà cùng có "Phòng 101" không bị trùng.
 */
export function suggestRoomId(houseId: string, name: string): string {
  const digits = name.match(/\d+/)?.[0]
  return digits ? `n${houseId}-${digits}` : ''
}

/** Node theo phòng (mọi vòng đời); node chưa gắn phòng không thuộc phòng nào. */
export function roomsWithNodes(devices: DeviceItem[]): Map<string, DeviceItem[]> {
  const map = new Map<string, DeviceItem[]>()
  for (const device of devices) {
    if (!device.room_id) continue
    map.set(device.room_id, [...(map.get(device.room_id) ?? []), device])
  }
  return map
}
