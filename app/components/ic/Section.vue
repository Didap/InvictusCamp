<script setup lang="ts">
// A titled part of a page. Sections are separated by a rule, not boxed: use cards only for things
// the user picks among (DESIGN.md, Components).
withDefaults(defineProps<{ title: string; description?: string; level?: 2 | 3 }>(), { level: 2 })
const id = useId()
</script>

<template>
  <section :aria-labelledby="id" class="border-b border-default py-8 first:pt-0 last:border-b-0 last:pb-0">
    <header class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <component :is="`h${level}`" :id="id" class="text-lg font-bold text-highlighted">{{ title }}</component>
        <p v-if="description" class="mt-1 max-w-prose text-sm text-muted">{{ description }}</p>
      </div>
      <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </section>
</template>
