<script setup lang="ts">
// Every page of the dashboard: navbar with the title (the page's h1), back link, actions, and a body
// of the chosen width. Usage: <IcPage title="Sessioni" back="/admin"><template #actions>…</template>…</IcPage>
const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    /** Route of the parent page, shown as a back button. */
    back?: string
    width?: 'narrow' | 'default' | 'wide' | 'full'
  }>(),
  { width: 'default' },
)

useHead({ title: () => `${props.title} · Invictus Camp` })

const WIDTHS = { narrow: 'max-w-3xl', default: 'max-w-6xl', wide: 'max-w-7xl', full: 'max-w-none' } as const
</script>

<template>
  <UDashboardPanel :ui="{ body: 'p-4 sm:p-6 lg:p-8' }">
    <template #header>
      <UDashboardNavbar :ui="{ right: 'gap-2', title: 'text-lg font-bold text-highlighted' }">
        <template #leading>
          <UDashboardSidebarCollapse class="lg:hidden" />
          <UButton
            v-if="back"
            :to="back"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            aria-label="Torna indietro"
          />
        </template>
        <template #title>
          <h1 class="truncate">{{ title }}</h1>
        </template>
        <template #right>
          <slot name="actions" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar v-if="$slots.toolbar">
        <slot name="toolbar" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div :class="['mx-auto w-full', WIDTHS[width]]">
        <p v-if="description" class="mb-8 max-w-prose text-muted">{{ description }}</p>
        <slot />
      </div>
    </template>
  </UDashboardPanel>
</template>
