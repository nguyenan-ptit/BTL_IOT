import { useMutation } from '@tanstack/react-query'
import { request } from '@/shared/api/http'
import { createTenantResponseSchema, type CreateTenantForm } from './schemas'

/** Backend chỉ nhận chủ trọ, và chỉ cho phòng thuộc nhà trọ của chính chủ trọ đó. */
export function useCreateTenant() {
  return useMutation({
    mutationFn: async ({ room_id, username, display_name, password }: CreateTenantForm) => {
      const result = await request('/api/accounts/tenants', createTenantResponseSchema, {
        method: 'POST',
        body: { room_id, username, display_name, password },
      })
      return result.user
    },
  })
}
