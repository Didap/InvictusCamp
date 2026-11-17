<script setup lang="ts">
import type { FamilyFormContent, FormQuestion } from '#shared/content/family-form'
import { isAnswered } from '#shared/schemas/families'
import type { FormAnswers } from '#shared/types/domain'

// The questionnaire answers of a family, section by section as the form is now (admin record).
// Unanswered: "Non indicato". The answers to questions taken out of the form follow under a heading of
// their own; the family no longer sees them.
const props = defineProps<{ answers: FormAnswers; form: FamilyFormContent }>()

function display(question: FormQuestion): string | null {
  const value = props.answers[question.id]
  if (!isAnswered(value)) return null
  if (typeof value === 'boolean') return value ? 'Sì' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

const items = (questions: FormQuestion[]) =>
  questions.map(question => ({ label: question.label, value: display(question) }))

const sections = computed(() => [
  ...props.form.sections.map(section => ({ id: section.id, title: section.title, items: items(section.questions) })),
  {
    id: 'retired',
    title: 'Domande non più nel modulo',
    items: items(props.form.retired.filter(question => isAnswered(props.answers[question.id]))),
  },
])
</script>

<template>
  <div class="space-y-8">
    <div v-for="section in sections.filter(section => section.items.length)" :key="section.id">
      <h3 class="mb-4 font-bold text-highlighted">{{ section.title }}</h3>
      <IcDataList :items="section.items" :columns="2" />
    </div>
  </div>
</template>
