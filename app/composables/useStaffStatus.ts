import { STAFF_AREA_STATUSES, type StaffStatus } from '#shared/utils/constants'

/**
 * Where the application of the signed-in staff member stands, asked once per person (the key holds the
 * user, so another account signing in on the same tab asks again). Until the approval the area is only
 * the home (spec 3.4): the menu and the route middleware read `inArea`.
 */
export function useStaffStatus() {
  const { user } = useUserSession()
  const api = useApi()
  const status = useState<StaffStatus | null>(`staff-status:${user.value?.id ?? ''}`, () => null)
  const inArea = computed(() => status.value !== null && STAFF_AREA_STATUSES.includes(status.value))

  async function load(): Promise<StaffStatus> {
    status.value ??= (await api<{ status: StaffStatus }>('/api/staff/status')).status
    return status.value
  }

  return { status, inArea, load }
}
