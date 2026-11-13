<script setup lang="ts">
import type { FeedbackArchive } from '#shared/types/feedback'
import { personTurns, turnsByActivity, votesTotal } from '#shared/utils/feedback'
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
// "Many sessions" is half of the year's (5 of 2026's 10), so the number keeps its meaning in any year.
const many = computed(() => Math.max(2, Math.ceil(sessions.value.length / 2)))
const stats = computed(() => [
  { label: 'Persone diverse nello staff', value: people.value.length },
  {
    label: `Presenti in ${many.value} sessioni o più`,
    value: people.value.filter(p => p.sessions.length >= many.value).length,
  },
  { label: 'Presenti in una sola sessione', value: people.value.filter(p => p.sessions.length === 1).length },
])

const view = ref<'person' | 'activity'>('person')
const viewItems = [
  { label: 'Per persona', value: 'person' },
  { label: 'Per attività', value: 'activity' },
]
const leaders = computed(() =>
  props.archive.staff.people
    .map(p => ({ name: p.name, ...personTurns(props.archive, p.name) }))
    .filter(p => p.turns.length)
    .sort((a, b) => votesTotal(b.votes) - votesTotal(a.votes) || a.name.localeCompare(b.name, 'it')),
)
const activities = computed(() => turnsByActivity(props.archive))
/** "con Nicola Macchi" for a turn in pairs, seen from one of the two. */
const partners = (names: string[], name: string) => {
  const others = names.filter(other => other !== name)
  return others.length ? `con ${others.join(', ')}` : undefined
}
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
        <li v-for="person in leaders" :key="person.name" class="p-5">
          <FeedbackVoteBar
            :label="person.name"
            :votes="person.votes"
            :sub="`${person.activities.join(', ')} · ${plural(person.turns.length, 'turno votato', 'turni votati')}`"
          />
          <UCollapsible>
            <UButton
              label="Sessione per sessione"
              color="neutral"
              variant="link"
              trailing-icon="i-lucide-chevron-down"
              class="mt-1 px-0"
              :aria-label="`Sessione per sessione: ${person.name}`"
              :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
            />
            <template #content>
              <ul class="mt-3 space-y-5 border-l-2 border-default pl-4">
                <li v-for="turn in person.turns" :key="`${turn.session}-${turn.activity}-${turn.names.join('+')}`">
                  <FeedbackVoteBar
                    :label="`S${turn.session} · ${turn.activity}`"
                    :votes="turn.votes"
                    :sub="partners(turn.names, person.name)"
                    :note="turn.note"
                  />
                </li>
              </ul>
            </template>
          </UCollapsible>
        </li>
      </ul>

      <div v-else class="space-y-8">
        <IcSection v-for="group in activities" :key="group.activity" :title="group.activity" :level="3">
          <ul class="grid gap-x-10 gap-y-6 md:grid-cols-2">
            <li v-for="turn in group.turns" :key="`${turn.session}-${turn.names.join('+')}`">
              <FeedbackVoteBar
                :label="`S${turn.session} · ${turn.names.join(' + ')}`"
                :votes="turn.votes"
                :note="turn.note"
              />
            </li>
          </ul>
        </IcSection>
      </div>
    </IcSection>
  </div>
</template>
