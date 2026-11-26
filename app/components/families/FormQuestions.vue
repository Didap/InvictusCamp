<script setup lang="ts">
import type { FormSection } from '#shared/content/family-form'
import { YES_NO_ITEMS } from '#shared/utils/constants'
import type { AnswerFields } from '~/utils/family-form'

// The sections of the questionnaire «Dati della famiglia», one IcSection each: in the family's form
// (/famiglia/profilo, inside its UForm, which shows the errors by question id) and in the preview of the
// editor (/admin/famiglie/modulo). `fields` is filled in place.
defineProps<{ sections: FormSection[]; fields: AnswerFields }>()
</script>

<template>
  <IcSection v-for="section in sections" :key="section.id" :title="section.title" :description="section.description">
    <div class="space-y-6">
      <UFormField
        v-for="question in section.questions"
        :key="question.id"
        :name="question.id"
        :label="question.label"
        :help="question.help"
        :required="question.required"
        :hint="question.required ? undefined : 'Facoltativo'"
      >
        <UInput v-if="question.type === 'text'" v-model="fields.texts[question.id]" class="w-full" />
        <UTextarea
          v-else-if="question.type === 'textarea'"
          v-model="fields.texts[question.id]"
          autoresize
          :rows="3"
          class="w-full"
        />
        <!-- A group is named by its legend: the label above does not reach the options. -->
        <URadioGroup
          v-else-if="question.type === 'select'"
          v-model="fields.texts[question.id]"
          :items="question.options"
          :legend="question.label"
          :ui="{ legend: 'sr-only' }"
        />
        <UCheckboxGroup
          v-else-if="question.type === 'multiselect'"
          v-model="fields.choices[question.id]"
          :items="question.options"
          :legend="question.label"
          :ui="{ legend: 'sr-only' }"
        />
        <URadioGroup
          v-else
          v-model="fields.yesNo[question.id]"
          :items="YES_NO_ITEMS"
          orientation="horizontal"
          :legend="question.label"
          :ui="{ legend: 'sr-only' }"
        />
      </UFormField>
    </div>
  </IcSection>
</template>
