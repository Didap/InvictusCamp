<script setup lang="ts">
import { hasHealthData } from '#shared/schemas/families'
import type { AdminFamilyHealth } from '#shared/types/families'
import { formatDateTime, memberName } from '#shared/utils/format'

// The reserved section of the admin family record. Health details stay closed until the
// administration opens them (loaded on demand, the reading is audited) and never leave this section.
const props = defineProps<{ familyId: string; consentAt: string | null }>()

const api = useApi()
const health = ref<AdminFamilyHealth | null>(null)
const loading = ref(false)

const withHealth = computed(() => health.value?.members.filter(hasHealthData) ?? [])
const othersCount = computed(() => (health.value?.members.length ?? 0) - withHealth.value.length)

async function show() {
  loading.value = true
  try {
    health.value = await api<AdminFamilyHealth>(`/api/admin/families/${props.familyId}/health`)
  } catch (error) {
    notifyError(error, 'Dati non disponibili')
  } finally {
    loading.value = false
  }
}

watch(
  () => props.familyId,
  () => {
    health.value = null
  },
)
</script>

<template>
  <div class="rounded-lg border border-dashed border-accented bg-elevated p-5">
    <p v-if="!consentAt" class="max-w-prose text-muted">
      La famiglia non ha dato il consenso al trattamento dei dati sulla salute: non ci sono dati da mostrare.
    </p>

    <div v-else-if="!health" class="space-y-4">
      <p class="max-w-prose text-sm text-muted">
        Consenso dato il {{ formatDateTime(consentAt) }}. I dati restano chiusi finché non li apri, e l’apertura viene
        registrata. Non riportarli in liste, email o note.
      </p>
      <UButton
        label="Mostra i dati sulla salute"
        icon="i-lucide-eye"
        color="neutral"
        variant="outline"
        :loading="loading"
        @click="show"
      />
    </div>

    <div v-else class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">Consenso dato il {{ formatDateTime(consentAt) }}.</p>
        <UButton label="Nascondi" icon="i-lucide-eye-off" color="neutral" variant="ghost" @click="health = null" />
      </div>
      <p v-if="!withHealth.length" class="text-muted">Nessun componente con dati sulla salute.</p>
      <div
        v-for="member in withHealth"
        :key="member.id"
        class="border-t border-default pt-5 first:border-t-0 first:pt-0"
      >
        <h3 class="mb-3 font-bold text-highlighted">{{ memberName(member, health?.members ?? []) }}</h3>
        <FamiliesHealthDetails :health="member" />
      </div>
      <p v-if="withHealth.length && othersCount" class="text-sm text-muted">
        Gli altri componenti non hanno dati sulla salute.
      </p>
    </div>
  </div>
</template>
