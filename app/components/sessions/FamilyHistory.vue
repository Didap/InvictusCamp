<script setup lang="ts">
import type { FamilyParticipationItem } from '#shared/types/sessions'
import { formatDateTime, formatDayRange } from '#shared/utils/format'

// CONTRACT (docs/BUILD.md): owned by A1 Sessioni. Admin family page: the sessions of one family (kind,
// status, dates) with links to each session, latest first. Props are final.
const props = defineProps<{ familyId: string }>()

const { data, error, refresh } = await useApiFetch<FamilyParticipationItem[]>(
  () => `/api/admin/sessions/by-family/${props.familyId}`,
)
const items = computed(() => data.value ?? [])

function answer(item: FamilyParticipationItem): string | null {
  if (item.respondedAt) return `Risposta del ${formatDateTime(item.respondedAt)}`
  if (item.invitedAt) return `Invitata il ${formatDateTime(item.invitedAt)}`
  return item.status === 'selected' ? 'Riceverà l’invito quando la sessione apre gli inviti' : null
}
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    title="Non riesco a caricare le sessioni della famiglia"
    :description="apiErrorMessage(error)"
    :actions="[{ label: 'Riprova', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
  />
  <UEmpty
    v-else-if="!items.length"
    icon="i-lucide-calendar-range"
    title="Nessuna sessione"
    description="La famiglia non è ancora in nessuna sessione. Puoi aggiungerla come titolare o come riserva."
  />
  <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-elevated">
    <li
      v-for="item in items"
      :key="item.id"
      class="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
    >
      <div class="min-w-0">
        <NuxtLink
          :to="`/admin/sessioni/${item.sessionId}?tab=famiglie`"
          class="font-semibold text-highlighted hover:underline focus-visible:underline"
        >
          {{ item.title }}
        </NuxtLink>
        <p class="text-sm text-muted">
          {{ formatDayRange(item.startDate, item.endDate) }}
          <template v-if="item.sessionStatus === 'cancelled' || item.sessionStatus === 'completed'">
            · sessione {{ item.sessionStatus === 'cancelled' ? 'annullata' : 'conclusa' }}
          </template>
        </p>
        <p v-if="answer(item)" class="text-sm text-muted">{{ answer(item) }}</p>
        <p v-if="item.declineReason" class="text-sm text-muted">Motivo: {{ item.declineReason }}</p>
      </div>
      <div class="flex shrink-0 flex-wrap gap-2">
        <IcStatusBadge kind="participationKind" :value="item.kind" />
        <IcStatusBadge kind="participationStatus" :value="item.status" />
      </div>
    </li>
  </ul>
</template>
