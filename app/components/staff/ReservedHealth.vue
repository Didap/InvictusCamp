<script setup lang="ts">
import { staffHealthItems } from '#shared/content/member-form'
import { hasStaffHealth } from '#shared/schemas/staff'
import type { StaffUsefulInfoDto } from '#shared/types/staff'

// The reserved section of a staff member's admin page: allergies, diet and the other details they shared,
// closed until opened (IcReservedHealth).
const props = defineProps<{ userId: string; consentAt: string | null }>()

const api = useApi()
function load() {
  const url: string = `/api/admin/staff/${props.userId}/health`
  return api<StaffUsefulInfoDto>(url)
}
</script>

<template>
  <IcReservedHealth
    :id="userId"
    v-slot="{ data }"
    :load="load"
    :consent-at="consentAt"
    no-consent="La persona non ha dato il consenso al trattamento dei dati sulla salute: non ci sono dati da mostrare."
  >
    <IcDataList v-if="hasStaffHealth(data)" :items="staffHealthItems(data)" />
    <p v-else class="text-muted">Nessun dato sulla salute.</p>
  </IcReservedHealth>
</template>
