import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { TenantAssignments } from '@/features/tenants/components/TenantAssignments'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('hiển thị danh sách từ API và làm mới sau khi chuyển phòng hoặc kết thúc thuê', async () => {
  const dialogPrototype = HTMLDialogElement.prototype
  if (!dialogPrototype.showModal) {
    Object.defineProperties(dialogPrototype, {
      showModal: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = true
        },
      },
      close: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = false
        },
      },
    })
    onTestFinished(() => {
      Reflect.deleteProperty(dialogPrototype, 'showModal')
      Reflect.deleteProperty(dialogPrototype, 'close')
    })
  }
  let items = [
    {
      assignment_id: 1,
      username: 'thue101',
      display_name: 'Người thuê A',
      room_id: '101',
      room_name: '101',
      house_name: 'Nhà A',
    },
  ]
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method !== 'PATCH') return Response.json({ items })
    if (url.endsWith('/1')) {
      items = [{ ...items[0]!, assignment_id: 2, room_id: '102', room_name: '102' }]
      return Response.json({ message: 'Đã chuyển phòng.' })
    }
    items = []
    return Response.json({ message: 'Đã kết thúc thuê.' })
  })
  vi.stubGlobal('fetch', fetcher)

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <TenantAssignments
        groups={[
          {
            id: 'a',
            name: 'Nhà A',
            rooms: [
              { id: '101', name: '101' },
              { id: '102', name: '102' },
            ],
          },
        ]}
      />
    </QueryClientProvider>,
  )
  const user = userEvent.setup()
  const row = (await screen.findByText('Người thuê A')).closest('li')!
  expect(within(row).getByText('Nhà A · Phòng 101')).toBeVisible()

  await user.click(within(row).getByRole('button', { name: 'Chuyển phòng' }))
  const move = within(screen.getByRole('dialog'))
  expect(move.queryByRole('option', { name: 'Nhà A · Phòng 101' })).toBeNull()
  await user.selectOptions(move.getByRole('combobox', { name: 'Phòng mới' }), '102')
  await user.click(move.getByRole('button', { name: 'Chuyển phòng' }))
  expect(await screen.findByText('Đã chuyển phòng.')).toBeVisible()
  expect(fetcher).toHaveBeenCalledWith(
    '/api/accounts/tenants/assignments/1',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ room_id: '102' }),
    }),
  )

  const updatedRow = screen.getByText('Nhà A · Phòng 102').closest('li')!
  await user.click(within(updatedRow).getByRole('button', { name: 'Kết thúc thuê' }))
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Kết thúc thuê' }),
  )
  expect(await screen.findByText('Đã kết thúc thuê.')).toBeVisible()
  await waitFor(() => expect(screen.queryByText('Người thuê A')).not.toBeInTheDocument())
  expect(fetcher).toHaveBeenCalledWith(
    '/api/accounts/tenants/assignments/2',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ room_id: null }),
    }),
  )
})
