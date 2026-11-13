<script setup lang="ts">
import type { FeedbackArchive } from '#shared/types/feedback'
import { itemResults, respondents, sessionOptions } from '#shared/utils/feedback'
import { plural } from '#shared/utils/format'

// The votes of the end-of-session questionnaire (docs/spec.md 3.13), for the year or one session.
const props = defineProps<{ archive: FeedbackArchive }>()

const session = ref('all')
const sessionNumber = computed(() => (session.value === 'all' ? null : Number(session.value)))
const sessionItems = computed(() => sessionOptions(props.archive))

const results = computed(() => itemResults(props.archive, sessionNumber.value))
const activities = computed(() => results.value.filter(r => r.kind === 'activity'))
const others = computed(() => results.value.filter(r => r.kind === 'other'))
const families = computed(() => respondents(props.archive, sessionNumber.value))
/** " in questa sessione" when one is chosen, for the empty messages. */
const inSession = computed(() => (sessionNumber.value === null ? '' : ' in questa sessione'))
const themes = computed(() =>
  props.archive.themes
    .filter(t => sessionNumber.value === null || t.sessions.includes(sessionNumber.value))
    .sort((a, b) => b.families - a.families),
)
</script>

<template>
  <div class="space-y-10">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <USelect v-model="session" :items="sessionItems" aria-label="Sessione" class="w-full sm:w-56" />
      <p class="text-muted">
        {{ plural(families, 'famiglia ha', 'famiglie hanno') }} risposto al questionario. Le risposte vuote non sono
        contate.
      </p>
    </div>

    <IcSection
      title="Quanto sono piaciute le attività"
      description="Per ogni attività, come si dividono i voti delle famiglie. Il voto di un turno fatto in coppia conta per entrambe le attività."
    >
      <FeedbackVoteLegend class="mb-4" />
      <ul v-if="activities.length" class="grid gap-x-10 gap-y-6 md:grid-cols-2">
        <li v-for="item in activities" :key="item.label">
          <FeedbackVoteBar :label="item.label" :votes="item.votes" />
        </li>
      </ul>
      <p v-else class="text-muted">Nessun voto sulle attività{{ inSession }}.</p>
    </IcSection>

    <IcSection title="Accoglienza, spazi e staff" description="Le altre voci del questionario.">
      <ul v-if="others.length" class="grid gap-x-10 gap-y-6 md:grid-cols-2">
        <li v-for="item in others" :key="item.label">
          <FeedbackVoteBar :label="item.label" :votes="item.votes" />
        </li>
      </ul>
      <p v-else class="text-muted">Nessun voto su queste voci{{ inSession }}.</p>
    </IcSection>

    <!-- Summed up by the camp for an imported year; the questionnaire has none (docs/spec.md 3.13). -->
    <IcSection
      v-if="archive.themes.length"
      title="Suggerimenti ricorrenti"
      description="Quello che hanno chiesto più famiglie. Tutte le risposte scritte sono nella scheda Commenti."
    >
      <ul v-if="themes.length" class="divide-y divide-default rounded-lg border border-default bg-elevated">
        <li v-for="theme in themes" :key="theme.title" class="p-5">
          <p class="font-semibold text-highlighted">{{ theme.title }}</p>
          <p class="mt-0.5 text-sm text-muted">
            {{ plural(theme.families, 'famiglia', 'famiglie') }} · {{ theme.sessions.map(s => `S${s}`).join(', ') }}
          </p>
          <p class="mt-2 max-w-prose">{{ theme.detail }}</p>
        </li>
      </ul>
      <p v-else class="text-muted">Nessun suggerimento ricorrente{{ inSession }}.</p>
    </IcSection>
  </div>
</template>
