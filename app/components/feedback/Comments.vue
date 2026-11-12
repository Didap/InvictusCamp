<script setup lang="ts">
import type { FeedbackArchive } from '#shared/types/feedback'
import { plural } from '#shared/utils/format'

// The written answers of the questionnaire (docs/spec.md 3.13), question by question. Anonymous: a family is
// a number within its session.
const props = defineProps<{ archive: FeedbackArchive }>()

const session = ref('all')
const question = ref('all')
const search = ref('')
const sessionItems = computed(() => [
  { label: 'Tutte le sessioni', value: 'all' },
  ...props.archive.sessions.map(s => ({ label: `Sessione ${s.number}`, value: String(s.number) })),
])
const questionItems = computed(() => [
  { label: 'Tutte le domande', value: 'all' },
  ...props.archive.comments.questions.map((label, i) => ({ label, value: String(i) })),
])

const groups = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase('it')
  const items = props.archive.comments.items.filter(
    c =>
      (session.value === 'all' || c.session === Number(session.value)) &&
      (question.value === 'all' || c.question === Number(question.value)) &&
      (!needle || c.text.toLocaleLowerCase('it').includes(needle)),
  )
  return props.archive.comments.questions
    .map((title, i) => ({ title, items: items.filter(c => c.question === i) }))
    .filter(group => group.items.length)
})
const shown = computed(() => groups.value.reduce((sum, g) => sum + g.items.length, 0))
</script>

<template>
  <div class="space-y-8">
    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="Cerca nei commenti"
        aria-label="Cerca nei commenti"
        class="w-full sm:w-72"
      />
      <USelect v-model="session" :items="sessionItems" aria-label="Sessione" class="w-full sm:w-52" />
      <USelect v-model="question" :items="questionItems" aria-label="Domanda" class="w-full sm:w-80" />
      <p class="text-sm text-muted sm:ml-auto" role="status">{{ plural(shown, 'commento', 'commenti') }}</p>
    </div>

    <IcSection v-for="group in groups" :key="group.title" :title="group.title" :level="2">
      <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
        <li v-for="(comment, i) in group.items" :key="i" class="p-5">
          <blockquote class="max-w-prose whitespace-pre-line">{{ comment.text }}</blockquote>
          <p class="mt-2 text-sm text-muted">Sessione {{ comment.session }} · famiglia {{ comment.family }}</p>
        </li>
      </ul>
    </IcSection>
    <p v-if="!groups.length" class="text-muted">Nessun commento con questi filtri.</p>
  </div>
</template>
