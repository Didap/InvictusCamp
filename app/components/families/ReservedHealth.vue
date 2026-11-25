<script setup lang="ts">
import { hasHealthData } from '#shared/schemas/families'
import type { AdminFamilyHealth } from '#shared/types/families'
import { memberName } from '#shared/utils/format'

// The reserved section of the admin family record: the members' health details, closed until opened
// (IcReservedHealth).
const props = defineProps<{ familyId: string; consentAt: string | null }>()

const api = useApi()
function load() {
  const url: string = `/api/admin/families/${props.familyId}/health`
  return api<AdminFamilyHealth>(url)
}

const withHealth = (health: AdminFamilyHealth) => health.members.filter(hasHealthData)
</script>

<template>
  <IcReservedHealth
    :id="familyId"
    v-slot="{ data }"
    :load="load"
    :consent-at="consentAt"
    no-consent="La famiglia non ha dato il consenso al trattamento dei dati sulla salute: non ci sono dati da mostrare."
  >
    <p v-if="!withHealth(data).length" class="text-muted">Nessun componente con dati sulla salute.</p>
    <div
      v-for="member in withHealth(data)"
      :key="member.id"
      class="border-t border-default pt-5 first:border-t-0 first:pt-0"
    >
      <h3 class="mb-3 font-bold text-highlighted">{{ memberName(member, data.members) }}</h3>
      <FamiliesHealthDetails :health="member" />
    </div>
    <p v-if="withHealth(data).length && withHealth(data).length < data.members.length" class="text-sm text-muted">
      Gli altri componenti non hanno dati sulla salute.
    </p>
  </IcReservedHealth>
</template>
