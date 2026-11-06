<script setup lang="ts">
// The answer to an invitation: recorded by the administration after a phone call (Conferma or Rinuncia)
// or given by the family when it gives up its place (Rinuncia, with an optional reason).
type Answer = 'confirmed' | 'declined'

const props = defineProps<{
  title: string
  description?: string
  answers: Answer[]
  submitLabel: string
  loading?: boolean
  reasonHelp?: string
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ submit: [value: { answer: Answer; reason: string | null }] }>()

const formId = useId()
const answer = ref<Answer>(props.answers[0] ?? 'declined')
const reason = ref('')

watch(open, value => {
  if (!value) return
  answer.value = props.answers[0] ?? 'declined'
  reason.value = ''
})

const items = computed(() =>
  props.answers.map(value =>
    value === 'confirmed'
      ? { value, label: 'Conferma la partecipazione', description: 'La famiglia occupa il posto.' }
      : { value, label: 'Rinuncia', description: 'Il posto si libera e puoi chiamare una riserva.' },
  ),
)

function submit() {
  emit('submit', { answer: answer.value, reason: answer.value === 'declined' ? reason.value.trim() || null : null })
}
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="description">
    <template #body>
      <form :id="formId" class="space-y-5" @submit.prevent="submit">
        <URadioGroup v-if="answers.length > 1" v-model="answer" :items="items" legend="La risposta" variant="card" />
        <UFormField v-if="answer === 'declined'" label="Motivo" hint="Facoltativo" :help="reasonHelp">
          <UTextarea v-model="reason" :rows="3" :maxlength="500" autoresize class="w-full" />
        </UFormField>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" label="Annulla" @click="open = false" />
        <UButton type="submit" :form="formId" :label="submitLabel" :loading="loading" />
      </div>
    </template>
  </UModal>
</template>
