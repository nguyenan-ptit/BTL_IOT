import { Copy, KeyRound, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { isApiError } from '@/shared/api/errors'
import { formatDateTime } from '@/shared/lib/datetime'
import { Button } from '@/shared/ui/Button'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { Field, TextInput } from '@/shared/ui/Field'
import { FormDialog } from '@/shared/ui/FormDialog'
import { Sheet } from '@/shared/ui/Sheet'
import {
  failedSteps,
  generateMqttPassword,
  mqttActionLabel,
  mqttPasswordSchema,
  useMqttOperation,
  useRequestCredential,
  useRetryOperation,
  type MqttOperation,
} from '../mqtt'
import type { NodeListItem } from '../schemas'
import { credentialLabel, mqttSyncLabel } from '../transitions'

function errorText(error: unknown): string {
  return isApiError(error) ? error.message : 'Chưa gửi được. Kiểm tra mạng rồi thử lại.'
}

/** Ô mật khẩu có nút tạo ngẫu nhiên và sao chép. Mật khẩu chỉ nằm trong state, không lưu ở đâu. */
function PasswordField({
  value,
  onChange,
  error,
  allowGenerate,
}: {
  value: string
  onChange: (v: string) => void
  error?: string
  allowGenerate: boolean
}) {
  const [copyNote, setCopyNote] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-2">
      <Field id="mqtt-password" label="Mật khẩu MQTT (16–128 ký tự)" error={error}>
        <TextInput
          id="mqtt-password"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          value={value}
          aria-invalid={!!error}
          onChange={(e) => {
            onChange(e.target.value)
            setCopyNote(null)
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {allowGenerate && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              onChange(generateMqttPassword())
              setCopyNote(null)
            }}
          >
            <RefreshCw aria-hidden className="size-4" />
            Tạo ngẫu nhiên
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={!value}
          onClick={() =>
            navigator.clipboard
              .writeText(value)
              .then(() => setCopyNote('Đã sao chép.'))
              .catch(() => setCopyNote('Không sao chép được, hãy chọn và sao chép tay.'))
          }
        >
          <Copy aria-hidden className="size-4" />
          Sao chép
        </Button>
      </div>
      {copyNote && (
        <p role="status" className="text-sm text-ink-soft">
          {copyNote}
        </p>
      )}
    </div>
  )
}

function OperationResult({ op }: { op: MqttOperation }) {
  const failed = failedSteps(op)
  return (
    <div role="status" className="flex flex-col gap-2 rounded-[4px] bg-ground px-3 py-2 text-sm">
      <p className="font-semibold">
        {mqttActionLabel[op.action]} ·{' '}
        {op.status === 'succeeded'
          ? 'Đã hoàn tất tại EMQX'
          : op.status === 'processing'
            ? 'Đang xử lý tại EMQX'
            : 'Chưa hoàn tất tại EMQX'}
      </p>
      <p className="text-ink-soft">{op.message}</p>
      {op.status === 'succeeded' && op.target_username && (
        <p>
          Tên tài khoản nạp vào ESP:{' '}
          <code className="rounded bg-sheet px-1.5 py-0.5 font-mono">{op.target_username}</code>
        </p>
      )}
      {op.status !== 'succeeded' && (
        <ul className="flex flex-col gap-0.5">
          {Object.entries(op.steps).map(([name, status]) => (
            <li key={name} className={failed.includes(name) ? 'font-bold text-alarm-deep' : ''}>
              {name}: {status}
            </li>
          ))}
          {op.error_code && <li className="text-ink-soft">Mã lỗi: {op.error_code}</li>}
        </ul>
      )}
      <p className="text-xs text-ink-soft">Bắt đầu {formatDateTime(op.created_at)}</p>
    </div>
  )
}

type Dialog =
  | { kind: 'issue'; action: 'provision' | 'reissue' }
  | { kind: 'retry'; op: MqttOperation }
  | { kind: 'revoke' }

/** Tài khoản MQTT của node: cấp, cấp lại, thu hồi và thử lại khi EMQX chưa hoàn tất. */
export function MqttCredentialPanel({ node }: { node: NodeListItem }) {
  const requestCredential = useRequestCredential(node.id)
  const retry = useRetryOperation(node.id)
  const lastOperation = useMqttOperation(node.id, node.operationId)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | undefined>()

  const latest = retry.data ?? requestCredential.data ?? lastOperation.data ?? null
  const retired = node.lifecycle === 'decommissioned'
  const busy = node.mqttSync === 'pending'

  const open = (next: Dialog) => {
    requestCredential.reset()
    retry.reset()
    setPassword(next.kind === 'issue' ? generateMqttPassword() : '')
    setPasswordError(undefined)
    setDialog(next)
  }

  const submitPassword = () => {
    if (!dialog || dialog.kind === 'revoke') return
    const needsPassword = dialog.kind === 'issue' || dialog.op.action !== 'revoke'
    if (needsPassword) {
      const parsed = mqttPasswordSchema.safeParse(password)
      if (!parsed.success) {
        setPasswordError(parsed.error.issues[0]?.message)
        return
      }
    }
    const onSuccess = () => setDialog(null)
    if (dialog.kind === 'issue') {
      requestCredential.mutate({ action: dialog.action, password }, { onSuccess })
    } else {
      retry.mutate(
        { operationId: dialog.op.operation_id, password: needsPassword ? password : undefined },
        { onSuccess },
      )
    }
  }

  const mutationError = requestCredential.error ?? retry.error

  return (
    <Sheet className="flex flex-col gap-3 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-bold">
        <KeyRound aria-hidden className="size-4" />
        Tài khoản MQTT
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-ink-soft">Tài khoản</dt>
        <dd className="font-semibold">{credentialLabel[node.credential]}</dd>
        <dt className="text-ink-soft">Đồng bộ</dt>
        <dd className="font-semibold">{mqttSyncLabel[node.mqttSync]}</dd>
      </dl>

      {latest && <OperationResult op={latest} />}

      {!retired && (
        <div className="flex flex-col gap-2">
          {node.credential === 'pending' && (
            <Button disabled={busy} onClick={() => open({ kind: 'issue', action: 'provision' })}>
              Cấp tài khoản
            </Button>
          )}
          {node.credential === 'active' && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => open({ kind: 'issue', action: 'reissue' })}
            >
              Cấp lại
            </Button>
          )}
          {node.credential !== 'revoked' && (
            <Button variant="danger" disabled={busy} onClick={() => open({ kind: 'revoke' })}>
              Thu hồi
            </Button>
          )}
        </div>
      )}
      {latest && latest.status !== 'succeeded' && (
        <Button variant="secondary" onClick={() => open({ kind: 'retry', op: latest })}>
          Thử lại thao tác
        </Button>
      )}
      {mutationError && !dialog && (
        <p role="alert" className="text-sm font-medium text-alarm-deep">
          {errorText(mutationError)}
        </p>
      )}

      <FormDialog
        open={dialog?.kind === 'issue' || dialog?.kind === 'retry'}
        title={
          dialog?.kind === 'issue'
            ? `${mqttActionLabel[dialog.action]} cho ${node.id}`
            : `Thử lại thao tác cho ${node.id}`
        }
        onClose={() => setDialog(null)}
      >
        <form
          noValidate
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            submitPassword()
          }}
        >
          {dialog?.kind === 'retry' && dialog.op.action === 'revoke' ? (
            <p className="text-sm">Gửi lại yêu cầu thu hồi tài khoản MQTT tới EMQX.</p>
          ) : (
            <>
              <p className="text-sm text-ink-soft">
                {dialog?.kind === 'retry'
                  ? 'Nhập đúng mật khẩu đã dùng lúc đầu. Backend không lưu mật khẩu nên không thể khôi phục.'
                  : 'Ghi lại mật khẩu này để nạp vào ESP và để thử lại nếu chưa hoàn tất. Backend không trả lại mật khẩu.'}
              </p>
              <PasswordField
                value={password}
                onChange={(v) => {
                  setPassword(v)
                  setPasswordError(undefined)
                }}
                error={passwordError}
                allowGenerate={dialog?.kind === 'issue'}
              />
            </>
          )}
          {mutationError && (
            <p role="alert" className="text-sm font-medium text-alarm-deep">
              {errorText(mutationError)}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 border-t border-rule pt-4 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Hủy
            </Button>
            <Button type="submit" loading={requestCredential.isPending || retry.isPending}>
              {dialog?.kind === 'retry' ? 'Thử lại' : 'Gửi'}
            </Button>
          </div>
        </form>
      </FormDialog>

      <ConfirmDialog
        open={dialog?.kind === 'revoke'}
        title={`Thu hồi tài khoản MQTT của ${node.id}?`}
        confirmLabel="Thu hồi"
        confirmVariant="danger"
        loading={requestCredential.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          requestCredential.mutate({ action: 'revoke' }, { onSettled: () => setDialog(null) })
        }
      >
        <p>
          Node bị chặn ở backend ngay, sau đó tài khoản bị xoá trên EMQX và các phiên kết nối bị
          ngắt. Muốn dùng lại phải cấp tài khoản mới.
        </p>
      </ConfirmDialog>
    </Sheet>
  )
}
