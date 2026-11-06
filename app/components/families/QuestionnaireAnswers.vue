<script setup lang="ts">
import { FAMILY_FORM_SECTIONS, type FormQuestion } from '#shared/content/family-form'
import { isAnswered } from '#shared/schemas/families'
import type { FormAnswers } from '#shared/types/domain'

// The questionnaire answers of a family, section by section (admin record). Unanswered: "Non indicato".
const props = defineProps<{ answers: FormAnswers }>()

function display(question: FormQuestion): string | null {
  const value = props.answers[question.id]
  if (!isAnswered(value)) return null
  if (typeof value === 'boolean') return value ? 'Sì' : 'No'
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

const sections = computed(() =>
  FAMILY_FORM_SECTIONS.map(section => ({
    id: section.id,
    title: section.title,
    items: section.questions.map(question => ({ label: question.label, value: display(question) })),
  })),
)
</script>

<template>
  <div class="space-y-8">
    <div v-for="section in sections" :key="section.id">
      <h3 class="mb-4 font-bold text-highlighted">{{ section.title }}</h3>
      <IcDataList :items="section.items" :columns="2" />
    </div>
  </div>
</template>
