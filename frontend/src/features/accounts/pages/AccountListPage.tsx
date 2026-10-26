import { Lock, LockOpen, Pencil, Plus, Search } from 'lucide-react'
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from 'nuqs'
import { useState } from 'react'
import { useCurrentUser } from '@/features/auth/hooks'
import type { User } from '@/features/auth/schemas'
import { useBoardingHouses, useRooms } from '@/features/rooms/hooks'
import { isApiError } from '@/shared/api/errors'
import { roleLabel } from '@/shared/lib/labels'
import { roleSchema } from '@/shared/schemas/common'
import { Button } from '@/shared/ui/Button'
import { cn } from '@/shared/ui/cn'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { DataState, EmptyState, Skeleton } from '@/shared/ui/DataState'
import { inputClass } from '@/shared/ui/Field'
import { FormDialog } from '@/shared/ui/FormDialog'
import { AccountForm } from '../components/AccountForm'
import { useSetLocked, useUsers } from '../hooks'

const lockErrors: Record<string, string> = {
  CANNOT_LOCK_SELF: 'Bạn không thể tự khóa tài khoản của mình.',
  LAST_ADMIN: 'Phải còn ít nhất một quản trị viên đang hoạt động.',
}

/** Quản lý tài khoản (US5, chỉ quản trị viên). */
export default function AccountListPage() {
  const [filters, setFilters] = useQueryStates(
    {
      q: parseAsString,
      'vai-tro': parseAsStringLiteral(roleSchema.options),
      khoa: parseAsBoolean,
      trang: parseAsInteger.withDefault(1),
    },
    { history: 'replace' },
  )
  const users = useUsers({
    q: filters.q,
    role: filters['vai-tro'],
    locked: filters.khoa,
    page: filters.trang,
  })
  const { data: me } = useCurrentUser()
  const houses = useBoardingHouses()
  const rooms = useRooms()
  const setLocked = useSetLocked()
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [locking, setLocking] = useState<User | null>(null)

  const scopeText = (u: User) => {
    if (u.role === 'admin') return 'Mọi phòng'
    if (u.role === 'landlord') {
      return (
        u.scope.boardingHouseIds
          .map((id) => houses.data?.find((h) => h.id === id)?.name ?? id)
          .join(', ') || 'Chưa gán'
      )
    }
    return (
      u.scope.roomIds
        .map((id) => `Phòng ${rooms.data?.find((r) => r.id === id)?.name ?? id}`)
        .join(', ') || 'Chưa gán'
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Quản lý tài khoản</h1>
        <Button onClick={() => setEditing('new')}>
          <Plus aria-hidden className="size-4" />
          Tạo tài khoản
        </Button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint"
          />
          <label htmlFor="acc-search" className="sr-only">
            Tìm theo tên hoặc tên đăng nhập
          </label>
          <input
            id="acc-search"
            type="search"
            placeholder="Tìm theo tên hoặc tên đăng nhập"
            className={cn(inputClass, 'pl-9')}
            value={filters.q ?? ''}
            onChange={(e) => void setFilters({ q: e.target.value || null, trang: 1 })}
          />
        </div>
        <label htmlFor="acc-role-filter" className="sr-only">
          Vai trò
        </label>
        <select
          id="acc-role-filter"
          className={cn(inputClass, 'sm:w-44')}
          value={filters['vai-tro'] ?? ''}
          onChange={(e) =>
            void setFilters({
              'vai-tro': (e.target.value || null) as (typeof filters)['vai-tro'],
              trang: 1,
            })
          }
        >
          <option value="">Mọi vai trò</option>
          {roleSchema.options.map((r) => (
            <option key={r} value={r}>
              {roleLabel[r]}
            </option>
          ))}
        </select>
        <label htmlFor="acc-lock-filter" className="sr-only">
          Trạng thái
        </label>
        <select
          id="acc-lock-filter"
          className={cn(inputClass, 'sm:w-44')}
          value={filters.khoa === null ? '' : String(filters.khoa)}
          onChange={(e) =>
            void setFilters({
              khoa: e.target.value === '' ? null : e.target.value === 'true',
              trang: 1,
            })
          }
        >
          <option value="">Mọi trạng thái</option>
          <option value="false">Đang hoạt động</option>
          <option value="true">Đã khóa</option>
        </select>
      </div>

      {setLocked.error && (
        <p
          role="alert"
          className="rounded-[var(--radius-sheet)] bg-alarm-wash px-3 py-2 text-sm font-medium text-alarm-deep"
        >
          {(isApiError(setLocked.error) && lockErrors[setLocked.error.code]) ||
            'Chưa lưu được. Kiểm tra mạng rồi thử lại.'}
        </p>
      )}

      <DataState
        query={users}
        isEmpty={(d) => d.items.length === 0}
        skeleton={<Skeleton className="h-56" />}
        empty={
          <EmptyState title="Không có tài khoản nào khớp">
            Thử bỏ bớt điều kiện tìm kiếm.
          </EmptyState>
        }
      >
        {(page) => (
          <ul className="flex flex-col divide-y divide-rule rounded-[var(--radius-sheet)] border border-rule bg-sheet">
            {page.items.map((u) => {
              const self = u.id === me?.id
              return (
                <li
                  key={u.id}
                  className={cn(
                    'flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3',
                    u.locked && 'bg-ground',
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="font-semibold">
                      {u.displayName}
                      {self && (
                        <span className="ml-2 text-sm font-normal text-ink-soft">(bạn)</span>
                      )}
                    </p>
                    <p className="text-sm text-ink-soft">
                      {u.username} · {roleLabel[u.role]} · {scopeText(u)}
                    </p>
                  </div>
                  {u.locked && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ground px-2.5 py-1 text-sm font-semibold text-ink-soft ring-1 ring-rule-strong ring-inset">
                      <Lock aria-hidden className="size-3.5" />
                      Đã khóa
                    </span>
                  )}
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(u)}
                      aria-label={`Sửa ${u.displayName}`}
                    >
                      <Pencil aria-hidden className="size-4" />
                      <span className="hidden sm:inline">Sửa</span>
                    </Button>
                    {u.locked ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLocked.mutate({ id: u.id, locked: false })}
                        aria-label={`Mở khóa ${u.displayName}`}
                      >
                        <LockOpen aria-hidden className="size-4" />
                        <span className="hidden sm:inline">Mở khóa</span>
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={self}
                        title={self ? 'Không thể tự khóa tài khoản của mình' : undefined}
                        onClick={() => {
                          setLocked.reset()
                          setLocking(u)
                        }}
                        aria-label={`Khóa ${u.displayName}`}
                      >
                        <Lock aria-hidden className="size-4" />
                        <span className="hidden sm:inline">Khóa</span>
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </DataState>

      <FormDialog
        open={editing !== null}
        title={editing === 'new' ? 'Tạo tài khoản' : `Sửa tài khoản ${editing?.displayName ?? ''}`}
        onClose={() => setEditing(null)}
      >
        <AccountForm
          key={editing === 'new' ? 'new' : editing?.id}
          user={editing === 'new' || editing === null ? undefined : editing}
          onDone={() => setEditing(null)}
        />
      </FormDialog>

      <ConfirmDialog
        open={locking !== null}
        title={`Khóa tài khoản ${locking?.displayName ?? ''}?`}
        confirmLabel="Khóa"
        confirmVariant="danger"
        loading={setLocked.isPending}
        onCancel={() => setLocking(null)}
        onConfirm={() =>
          locking &&
          setLocked.mutate({ id: locking.id, locked: true }, { onSettled: () => setLocking(null) })
        }
      >
        <p>
          Người này sẽ không đăng nhập được cho đến khi được mở khóa. Dữ liệu và lịch sử vẫn giữ
          nguyên.
        </p>
      </ConfirmDialog>
    </div>
  )
}
