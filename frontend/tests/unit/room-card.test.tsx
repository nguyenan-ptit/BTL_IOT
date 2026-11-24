import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RoomCard } from '@/features/rooms/components/RoomCard'
import { computeRoomOverall } from '@/features/rooms/overall'
import { roomStatusSchema } from '@/features/rooms/schemas'
import { roomNodeViews } from '@/features/rooms/sensors'

afterEach(cleanup)

const first = {
  id: 'node11',
  code: 'node11',
  lifecycle: 'active',
  connectivity: 'online',
  lastSeenAt: '2026-11-24T12:00:00Z',
  sensors: [{ kind: 'gas', health: 'ok', value: 172 }],
}
const second = {
  ...first,
  id: 'node12',
  code: 'node12',
  sensors: [{ kind: 'gas', health: 'ok', value: 284 }],
}

describe('phòng có nhiều node', () => {
  it.each([
    { connectivity: 'online', incident: null, overall: 'normal', connected: 2 },
    { connectivity: 'offline', incident: null, overall: 'offline', connected: 1 },
    { connectivity: 'offline', incident: 'fire-1', overall: 'alarm', connected: 1 },
  ])(
    'hiện hai node khi trạng thái phòng là $overall',
    ({ connectivity, incident, overall, connected }) => {
      const status = roomStatusSchema.parse({
        room: { id: '101', name: '101', boardingHouseId: '1' },
        node: first,
        sensors: first.sensors,
        nodes: [first, { ...second, connectivity }],
        activeIncidentId: incident,
        hazardSigns: incident ? ['flame'] : [],
      })
      const nodes = roomNodeViews(status)
      const actualOverall = computeRoomOverall(status, nodes)
      expect(actualOverall).toBe(overall)
      render(
        <RoomCard
          status={status}
          nodes={nodes}
          overall={actualOverall}
          now={new Date('2026-11-24T12:01:00Z')}
        />,
      )

      const [firstItem, secondItem] = screen.getAllByRole('listitem')
      expect(within(firstItem!).getByText('node11')).toBeVisible()
      expect(within(firstItem!).getByText('172')).toBeVisible()
      expect(within(secondItem!).getByText('node12')).toBeVisible()
      expect(within(secondItem!).getByText('284')).toBeVisible()
      expect(
        within(secondItem!).getByText(connectivity === 'offline' ? 'Mất kết nối' : 'Đang kết nối'),
      ).toBeVisible()
      expect(screen.getByText(`${connected}/2 node online`)).toBeVisible()
    },
  )
})
