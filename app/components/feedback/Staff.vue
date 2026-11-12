<script setup lang="ts">
import type { FeedbackArchive } from '#shared/types/feedback'
import { leadsByActivity, personLeads, votesTotal } from '#shared/utils/feedback'
import { plural } from '#shared/utils/format'

// Who was there in each session and how the families voted the activities each person led (docs/spec.md
// 3.13). Administration only: it has names.
const props = defineProps<{ archive: FeedbackArchive }>()

const sessions = computed(() => props.archive.sessions.map(s => s.number))
const people = computed(() =>
  [...props.archive.staff.people].sort(
    (a, b) => b.sessions.length - a.sessions.length || a.name.localeCompare(b.name, 'it'),
  ),
)
const stats = computed(() => [
  { label: 'Persone diverse nello staff', value: people.value.length },
  { label: 'Presenti in 5 sessioni o più', value: people.value.filter(p => p.sessions.length >= 5).length },
  { label: 'Presenti in una sola sessione', value: people.value.filter(p => p.sessions.length === 1).length },
])

const view = ref<'person' | 'activity'>('person')
const viewItems = [
  { label: 'Per persona', value: 'person' },
  { label: 'Per attività', value: 'activity' },
]
const leaders = computed(() =>
  props.archive.staff.people
    .filter(p => p.leads.length)
    .map(p => ({ ...p, ...personLeads(p) }))
    .sort((a, b) => votesTotal(b.votes) - votesTotal(a.votes) || a.name.localeCompare(b.name, 'it')),
)
const activities = computed(() => leadsByActivity(props.archive))
</script>

<template>
  <div class="space-y-10">
    <p v-if="archive.staff.note" class="text-muted">{{ archive.staff.note }}</p>

    <IcSection title="Presenze" description="Chi c'era in ogni sessione, dalla persona più presente.">
      <div class="mb-6 grid gap-4 sm:grid-cols-3">
        <IcStatCard v-for="stat in stats" :key="stat.label" :label="stat.label" :value="stat.value" />
      </div>
      <div class="overflow-x-auto rounded-lg border border-default bg-elevated">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default text-left text-muted">
              <th scope="col" class="px-4 py-2.5 font-semibold">Nome</th>
              <th v-for="s in sessions" :key="s" scope="col" class="px-2 py-2.5 text-center font-semibold">S{{ s }}</th>
              <th scope="col" class="px-4 py-2.5 text-right font-semibold">Totale</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="person in people" :key="person.name">
              <th scope="row" class="px-4 py-2 text-left font-medium whitespace-nowrap text-highlighted">
                {{ person.name }}
              </th>
              <td v-for="s in sessions" :key="s" class="px-2 py-2 text-center">
                <span
                  v-if="person.sessions.includes(s)"
                  class="inline-block size-2.5 rounded-full bg-primary"
                  role="img"
                  :aria-label="`Presente in S${s}`"
                />
              </td>
              <td class="px-4 py-2 text-right font-semibold">{{ person.sessions.length }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </IcSection>

    <IcSection
      title="Attività condotte"
      description="Come le famiglie hanno votato le attività condotte da ciascuno. Per attività è il confronto più utile: la stessa attività sessione per sessione."
    >
      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <UTabs v-model="view" :items="viewItems" :content="false" variant="pill" size="sm" />
        <FeedbackVoteLegend />
      </div>

      <ul v-if="view === 'person'" class="divide-y divide-default rounded-lg border border-default bg-elevated">
        <li v-for="person in leaders" :key="person.name">
          <details class="group">
            <summary class="flex cursor-pointer list-none items-start gap-3 p-5 hover:bg-accented/40">
              <FeedbackVoteBar
                class="flex-1"
                :label="person.name"
                :votes="person.votes"
                :sub="`${person.activities.join(', ')} · ${plural(person.leads.length, 'turno votato', 'turni votati')}`"
              />
              <UIcon
                name="i-lucide-chevron-down"
                class="mt-1 size-5 shrink-0 text-muted transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <ul class="space-y-5 border-t border-default bg-default px-5 py-4">
              <li v-for="(lead, i) in person.leads" :key="i">
                <FeedbackVoteBar :label="`S${lead.session} · ${lead.activity}`" :votes="lead.votes" :note="lead.note" />
              </li>
            </ul>
          </details>
        </li>
      </ul>

      <div v-else class="space-y-8">
        <IcSection v-for="group in activities" :key="group.activity" :title="group.activity" :level="3">
          <ul class="grid gap-x-10 gap-y-6 md:grid-cols-2">
            <li v-for="(row, i) in group.rows" :key="i">
              <FeedbackVoteBar :label="`S${row.session} · ${row.name}`" :votes="row.votes" :note="row.note" />
            </li>
          </ul>
        </IcSection>
      </div>
    </IcSection>
  </div>
</template>
