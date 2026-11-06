<script setup lang="ts">
import type { DashboardTodo } from '#shared/types/dashboard'

// "Da fare": each item is a link to the page where it is done.
defineProps<{ items: DashboardTodo[] }>()
</script>

<template>
  <p v-if="!items.length" class="flex items-center gap-2 text-muted">
    <UIcon name="i-lucide-circle-check" class="size-5 shrink-0 text-success" aria-hidden="true" />
    Niente in sospeso: quando qualcosa chiede la tua attenzione, compare qui.
  </p>
  <ul v-else class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-elevated">
    <li v-for="item in items" :key="item.key">
      <NuxtLink
        :to="item.to"
        class="group flex min-h-11 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <UIcon :name="item.icon" class="size-5 shrink-0 text-primary" aria-hidden="true" />
        <span class="min-w-0 flex-1">
          <span class="block font-semibold text-highlighted group-hover:underline">{{ item.label }}</span>
          <span v-if="item.detail" class="block text-sm text-muted">{{ item.detail }}</span>
        </span>
        <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-dimmed" aria-hidden="true" />
      </NuxtLink>
    </li>
  </ul>
</template>
