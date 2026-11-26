<script setup lang="ts">
import { CHOICES_UI, type Choice } from '#shared/content/member-form'

// A list of choices with «Altro» as its last item: ticked, a field opens for what the list does not have.
// `name` is where the errors of the text land (`health.info.notes`).
const choices = defineModel<string[]>('choices', { required: true })
const other = defineModel<string>('other', { required: true })
const props = defineProps<{ items: readonly Choice[]; legend: string; name: string }>()

const OTHER = '__other'
// Open while there is a text, or from the moment it is ticked; unticked, the text goes.
const otherOpen = ref(Boolean(other.value.trim()))
watch(other, value => {
  if (value.trim()) otherOpen.value = true
})
const items = computed(() => [...props.items, { value: OTHER, label: 'Altro' }])
const model = computed({
  get: () => (otherOpen.value ? [...choices.value, OTHER] : choices.value),
  set: (values: string[]) => {
    choices.value = values.filter(value => value !== OTHER)
    otherOpen.value = values.includes(OTHER)
    if (!otherOpen.value) other.value = ''
  },
})
</script>

<template>
  <div class="space-y-3">
    <UCheckboxGroup v-model="model" :items="items" :legend="legend" :ui="CHOICES_UI" />
    <UFormField v-if="otherOpen" :name="name" :label="`${legend}: altro`" :ui="{ label: 'sr-only' }">
      <UInput v-model="other" placeholder="Scrivi quali" :maxlength="500" class="w-full sm:max-w-md" />
    </UFormField>
  </div>
</template>
