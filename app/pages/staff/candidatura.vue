<script setup lang="ts">
import type { StaffApplicationDto } from '#shared/types/staff'
import { todayIso } from '#shared/utils/dates'
import { formatDay } from '#shared/utils/format'

// The application as it was sent (spec 3.4), read only: the CV, and what people who applied with the
// older, longer form wrote. Only approved staff reach this page; the review notes never do.
const { label, meta } = useEnums()
const { data: application } = await useApiFetch<StaffApplicationDto>('/api/staff/application')

const roleNames = computed(() =>
  (application.value?.roleOptions ?? []).filter(role => application.value?.roles.includes(role.id)),
)
const dayOf = (instant: string | null) => (instant ? formatDay(todayIso(new Date(instant)), 'long') : '')

const SENT_TITLE: Record<string, string> = {
  applied: 'Candidatura inviata',
  approved: 'Candidatura approvata',
  rejected: 'Candidatura non selezionata',
  inactive: 'Candidatura approvata',
}
// Only what the person wrote: an application sent with the CV alone has no birth date nor texts.
const details = computed(() => {
  const a = application.value
  if (!a) return []
  return [
    { label: 'Ti candidi per', value: label('staffTeam', a.team) },
    { label: 'Data di nascita', value: a.birthDate ? formatDay(a.birthDate, 'long') : null },
    { label: 'Città', value: a.city },
  ].filter(item => item.value)
})
const texts = computed(() => {
  const a = application.value
  if (!a) return []
  return [
    { label: 'Titoli e qualifiche', value: a.qualifications },
    { label: 'Esperienze', value: a.experience },
    { label: 'Motivazione', value: a.motivation },
  ].filter(item => item.value)
})
</script>

<template>
  <IcPage title="Candidatura" width="narrow">
    <template v-if="application">
      <UAlert
        :color="application.status === 'rejected' ? 'neutral' : 'info'"
        variant="subtle"
        :icon="meta('staffStatus', application.status).icon"
        :title="SENT_TITLE[application.status] ?? 'Candidatura inviata'"
      >
        <template v-if="application.appliedAt" #description>
          Inviata il {{ dayOf(application.appliedAt) }}.
          <IcContactLine as="span" lead="Se devi correggere qualcosa" />
        </template>
      </UAlert>
      <IcSection title="Su di te">
        <IcDataList :items="details" :columns="2" />
      </IcSection>
      <IcSection v-if="roleNames.length" title="Ruoli">
        <ul class="flex flex-wrap gap-2">
          <li v-for="role in roleNames" :key="role.id">
            <UBadge :label="role.name" color="neutral" variant="outline" size="lg" />
          </li>
        </ul>
      </IcSection>
      <IcSection v-if="texts.length" title="Esperienza">
        <dl class="space-y-5">
          <div v-for="item in texts" :key="item.label">
            <dt class="text-sm font-semibold text-muted">{{ item.label }}</dt>
            <dd class="mt-1 max-w-prose whitespace-pre-line">{{ item.value }}</dd>
          </div>
        </dl>
      </IcSection>
      <IcSection title="Curriculum">
        <IcFileLink v-if="application.cv" :file="application.cv" />
        <p v-else class="text-dimmed">Non caricato</p>
      </IcSection>
    </template>
  </IcPage>
</template>
