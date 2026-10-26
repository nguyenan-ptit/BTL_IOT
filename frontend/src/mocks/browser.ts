import { setupWorker } from 'msw/browser'
import { authHandlers } from './handlers/auth'
import { incidentHandlers } from './handlers/incidents'
import { measurementHandlers } from './handlers/measurements'
import { nodeHandlers } from './handlers/nodes'
import { userHandlers } from './handlers/users'
import { auditHandlers } from './handlers/audit'
import { roomHandlers } from './handlers/rooms'
import { seed } from './seed'
import { scenarios, startSimulator } from './simulator'

export const handlers = [
  ...authHandlers,
  ...roomHandlers,
  ...incidentHandlers,
  ...measurementHandlers,
  ...nodeHandlers,
  ...userHandlers,
  ...auditHandlers,
]

export async function startMockApi() {
  seed()
  startSimulator()
  // Cho phép test tự động gọi kịch bản mô phỏng khi đang có hộp thoại che bảng mô phỏng.
  Object.assign(window, { __mockScenarios: scenarios })
  const worker = setupWorker(...handlers)
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true })
}
