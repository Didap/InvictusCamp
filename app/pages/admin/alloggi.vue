<script setup lang="ts">
import type { LodgingListItem } from '#shared/types/lodgings'
import { enumMeta } from '#shared/utils/constants'
import { plural } from '#shared/utils/format'

// Alloggi (docs/spec.md 3.11): the bed layout of the camp, entered once and used by every session,
// where the Alloggi tab places each family in a lodging.
const api = useApi()
const confirm = useConfirm()
const { data, status, refresh } = useApiFetch<LodgingListItem[]>('/api/admin/lodgings')

const editing = ref<LodgingListItem | null>(null)
const modalOpen = ref(false)
function edit(lodging: LodgingListItem | null) {
  editing.value = lodging
  modalOpen.value = true
}

async function remove(lodging: LodgingListItem) {
  const ok = await confirm({
    title: `Elimini «${lodging.name}»?`,
    description: [
      lodging.sessions
        ? `È assegnato a una famiglia in ${plural(lodging.sessions, 'sessione', 'sessioni')}: lì la famiglia resta senza alloggio.`
        : 'Non è assegnato a nessuna famiglia.',
      'Non parte nessuna email.',
    ].join(' '),
    confirmLabel: 'Elimina l’alloggio',
    danger: true,
  })
  if (!ok) return
  try {
    const url: string = `/api/admin/lodgings/${lodging.id}`
    await api(url, { method: 'DELETE' })
    notifySuccess('Alloggio eliminato')
    await refresh()
  } catch (error) {
    notifyError(error)
  }
}

const totals = computed(() => {
  const list = data.value ?? []
  const beds = list.reduce((sum, lodging) => sum + lodging.beds, 0)
  return `${plural(list.length, 'alloggio', 'alloggi')} · ${plural(beds, 'posto letto', 'posti letto')}`
})

const groups = computed(() => {
  const byArea = new Map<string, LodgingListItem[]>()
  for (const lodging of data.value ?? []) {
    const area = lodging.area ?? 'Altri alloggi'
    byArea.set(area, [...(byArea.get(area) ?? []), lodging])
  }
  return [...byArea.entries()].map(([area, items]) => ({ area, items }))
})

const features = (lodging: LodgingListItem) =>
  lodging.features.map(feature => enumMeta('lodgingFeature', feature).label).join(', ')
</script>

<template>
  <IcPage
    title="Alloggi"
    description="Lo schema dei posti letto del camp: lo inserisci una volta e in ogni sessione, nella scheda Alloggi, assegni un alloggio a ogni famiglia."
    width="wide"
  >
    <template #actions>
      <UButton icon="i-lucide-plus" label="Nuovo alloggio" @click="edit(null)" />
    </template>

    <div v-if="!data && status === 'pending'" class="space-y-2" aria-busy="true">
      <USkeleton v-for="n in 4" :key="n" class="h-16 w-full" />
    </div>

    <UAlert
      v-else-if="!data"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare gli alloggi"
      description="Controlla la connessione e riprova."
      :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <UEmpty
      v-else-if="!data.length"
      icon="i-lucide-bed-double"
      title="Ancora nessun alloggio"
      description="Aggiungi le villette, le camere o le case del camp con i loro posti letto e le dotazioni (cucina, bagno senza barriere, microonde)."
      :actions="[{ label: 'Nuovo alloggio', icon: 'i-lucide-plus', onClick: () => edit(null) }]"
    />

    <template v-else>
      <p class="mb-6 text-sm text-muted">{{ totals }}</p>
      <section v-for="group in groups" :key="group.area" class="mb-8 last:mb-0" :aria-label="group.area">
        <h2 class="mb-3 text-lg font-bold text-highlighted">{{ group.area }}</h2>
        <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li
            v-for="lodging in group.items"
            :key="lodging.id"
            class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start"
          >
            <div class="min-w-0 flex-1">
              <p class="font-semibold text-highlighted">{{ lodging.name }}</p>
              <p class="mt-1 text-sm text-default">
                {{ plural(lodging.beds, 'posto letto', 'posti letto')
                }}<template v-if="lodging.description"> · {{ lodging.description }}</template>
              </p>
              <p v-if="lodging.features.length" class="mt-1 text-sm text-muted">{{ features(lodging) }}</p>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <UButton
                label="Modifica"
                :aria-label="`Modifica «${lodging.name}»`"
                icon="i-lucide-pencil"
                color="neutral"
                variant="outline"
                @click="edit(lodging)"
              />
              <UButton
                :aria-label="`Elimina «${lodging.name}»`"
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                @click="remove(lodging)"
              />
            </div>
          </li>
        </ul>
      </section>
    </template>

    <LodgingsModal v-model:open="modalOpen" :lodging="editing" @saved="refresh" />
  </IcPage>
</template>
