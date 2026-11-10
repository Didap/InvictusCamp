<script setup lang="ts">
import type { ProgrammeView } from '#shared/types/programmes'
import { rangeDays } from '#shared/utils/dates'
import { formatDayRange } from '#shared/utils/format'

// The programme of one session as a family or a staff member reads it (pages famiglia/programma and
// staff/programma): the server already left out what they must not read.
const props = defineProps<{ url: string; back: string }>()
const { data, error, refresh } = await useApiFetch<ProgrammeView>(() => props.url)
</script>

<template>
  <IcPage title="Programma della settimana" :back="back">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare il programma"
      :description="apiErrorMessage(error)"
      :actions="[{ label: 'Riprova', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
    />
    <template v-else-if="data">
      <p class="mb-8 text-muted">
        <span class="font-semibold text-highlighted">{{ data.session.title }}</span
        >,
        {{ formatDayRange(data.session.startDate, data.session.endDate, 'long') }}
      </p>
      <UEmpty
        v-if="!data.content"
        icon="i-lucide-calendar-clock"
        title="Il programma non è ancora pronto"
        description="Lo trovi qui appena l’amministrazione lo prepara."
      />
      <ProgrammeWeek v-else :content="data.content" :dates="rangeDays(data.session)" />
    </template>
  </IcPage>
</template>
