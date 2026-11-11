<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { enumLabel } from '#shared/utils/constants'
import { fullName, initials } from '#shared/utils/format'

// The dashboard shell of every signed-in page: sidebar with the role's sections, account menu. Families
// and staff also find there how to reach the camp, families at their own address.
const { user, clear } = useUserSession()
const nav = useNav()
const showHelp = computed(() => user.value?.role === 'family' || user.value?.role === 'staff')
const contact = useContact()

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  await clear()
  await navigateTo('/accedi', { replace: true })
}

const accountItems = computed<DropdownMenuItem[][]>(() => [
  [{ label: fullName(user.value), description: user.value?.email, type: 'label' }],
  [{ label: 'Il mio account', icon: 'i-lucide-user-cog', to: '/account' }],
  [{ label: 'Esci', icon: 'i-lucide-log-out', onSelect: logout }],
])
</script>

<template>
  <UDashboardGroup unit="rem" storage-key="invictus-dashboard">
    <UDashboardSidebar
      collapsible
      resizable
      :default-size="16"
      :min-size="14"
      :max-size="22"
      :collapsed-size="4.5"
      class="bg-elevated"
      :ui="{ header: 'h-(--ui-header-height) px-4', footer: 'border-t border-default p-3' }"
    >
      <template #header="{ collapsed }">
        <IcLogo :compact="collapsed" :subtitle="user ? enumLabel('userRole', user.role) : 'Gestionale'" />
      </template>

      <template #default="{ collapsed }">
        <nav aria-label="Sezioni" class="flex flex-col gap-4">
          <UNavigationMenu
            v-for="(group, index) in nav"
            :key="index"
            :items="group"
            :collapsed="collapsed"
            orientation="vertical"
            tooltip
            highlight
          />
        </nav>
        <div v-if="showHelp && !collapsed" class="mt-auto rounded-lg bg-muted px-3 py-2.5 text-sm">
          <p class="font-semibold text-highlighted">{{ contact.question }}</p>
          <IcContactLine class="mt-1 text-muted" />
        </div>
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu :items="accountItems" :content="{ align: 'start', side: 'top' }" class="w-full">
          <UButton
            :avatar="{ text: initials(user), alt: '' }"
            :label="collapsed ? undefined : fullName(user)"
            :aria-label="collapsed ? `Account di ${fullName(user)}` : undefined"
            trailing-icon="i-lucide-chevrons-up-down"
            color="neutral"
            variant="ghost"
            block
            :square="collapsed"
            class="data-[state=open]:bg-elevated"
            :ui="{ trailingIcon: collapsed ? 'hidden' : 'ms-auto text-dimmed' }"
          />
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
