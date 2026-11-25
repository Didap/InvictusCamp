<script setup lang="ts" generic="T">
import { formatDateTime } from '#shared/utils/format'

// The reserved section of an admin page (a family, a staff member): health data stays closed until the
// administration opens it (`load` asks the endpoint, which records the reading) and never leaves the section.
// Without the consent there is nothing to open. The slot shows what was loaded. Keyed by the person, so
// another one starts closed.
const props = defineProps<{ load: () => Promise<T>; consentAt: string | null; noConsent: string }>()
defineSlots<{ default(props: { data: T }): unknown }>()

const data = shallowRef<T | null>(null)
const loading = ref(false)

async function show() {
  loading.value = true
  try {
    data.value = await props.load()
  } catch (error) {
    notifyError(error, 'Dati non disponibili')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="rounded-lg border border-dashed border-accented bg-elevated p-5">
    <p v-if="!consentAt" class="max-w-prose text-muted">{{ noConsent }}</p>

    <div v-else-if="data === null" class="space-y-4">
      <p class="max-w-prose text-sm text-muted">
        Consenso dato il {{ formatDateTime(consentAt) }}. I dati restano chiusi finché non li apri, e l’apertura viene
        registrata. Non riportarli in liste, email o note.
      </p>
      <UButton
        label="Mostra i dati sulla salute"
        icon="i-lucide-eye"
        color="neutral"
        variant="outline"
        :loading="loading"
        @click="show"
      />
    </div>

    <div v-else class="space-y-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">Consenso dato il {{ formatDateTime(consentAt) }}.</p>
        <UButton label="Nascondi" icon="i-lucide-eye-off" color="neutral" variant="ghost" @click="data = null" />
      </div>
      <slot :data="data" />
    </div>
  </div>
</template>
