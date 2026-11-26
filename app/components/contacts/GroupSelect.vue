<script setup lang="ts">
// The groups of a contact or of an import (spec 3.16): pick among the existing ones or type a new name.
const model = defineModel<string[]>({ required: true })
defineProps<{ ariaLabel?: string }>()

const { groups, create } = useContactGroups()
const items = computed(() => groups.value.map(group => ({ label: group.name, value: group.id })))

async function onCreate(name: string) {
  const id = await create(name.trim())
  if (id) model.value = [...model.value, id]
}
</script>

<template>
  <USelectMenu
    v-model="model"
    :items="items"
    value-key="value"
    multiple
    create-item
    placeholder="Nessun gruppo"
    :search-input="{ placeholder: 'Cerca o scrivi un gruppo nuovo' }"
    :aria-label="ariaLabel"
    class="w-full"
    @create="onCreate"
  />
</template>
