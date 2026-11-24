import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '@/shared/api/http'
import {
  createTenantResponseSchema,
  tenantAssignmentsSchema,
  tenantAssignmentUpdateSchema,
  type CreateTenantForm,
} from './schemas'

const tenantsPath = '/api/accounts/tenants'
const assignmentsKey = ['tenant-assignments'] as const

export function useTenantAssignments() {
  return useQuery({
    queryKey: assignmentsKey,
    queryFn: async ({ signal }) =>
      (await request(tenantsPath, tenantAssignmentsSchema, { signal })).items,
  })
}

/** Backend chỉ nhận chủ trọ, và chỉ cho phòng thuộc nhà trọ của chính chủ trọ đó. */
export function useCreateTenant() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async ({ room_id, username, display_name, password }: CreateTenantForm) => {
      const result = await request(tenantsPath, createTenantResponseSchema, {
        method: 'POST',
        body: { room_id, username, display_name, password },
      })
      return result.user
    },
    onSuccess: () => client.invalidateQueries({ queryKey: assignmentsKey }),
  })
}

export function useUpdateTenantAssignment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ assignmentId, roomId }: { assignmentId: number; roomId: string | null }) =>
      request(`${tenantsPath}/assignments/${assignmentId}`, tenantAssignmentUpdateSchema, {
        method: 'PATCH',
        body: { room_id: roomId },
      }),
    onSettled: () => client.invalidateQueries({ queryKey: assignmentsKey }),
  })
}
