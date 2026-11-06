<script setup lang="ts">
// Label and value pairs (a person's details, a session's facts). Empty values read "Non indicato".
defineProps<{
  items: { label: string; value?: string | number | null }[]
  columns?: 1 | 2 | 3
}>()
</script>

<template>
  <dl
    class="grid gap-x-8 gap-y-5"
    :class="{ 'sm:grid-cols-2': columns === 2, 'sm:grid-cols-2 lg:grid-cols-3': columns === 3 }"
  >
    <div v-for="item in items" :key="item.label" class="min-w-0">
      <dt class="text-sm font-semibold text-muted">{{ item.label }}</dt>
      <dd
        class="mt-0.5 break-words"
        :class="item.value === null || item.value === undefined || item.value === '' ? 'text-dimmed' : 'text-default'"
      >
        {{ item.value === null || item.value === undefined || item.value === '' ? 'Non indicato' : item.value }}
      </dd>
    </div>
  </dl>
</template>
