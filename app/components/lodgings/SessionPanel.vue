<script setup lang="ts">
import type { SelectMenuItem } from '@nuxt/ui'
import type { Lodging, SessionLodgingFamily, SessionLodgingsDto } from '#shared/types/lodgings'
import { enumMeta } from '#shared/utils/constants'
import { plural } from '#shared/utils/format'
import { lodgingWarnings } from '#shared/utils/lodgings'

// The Alloggi tab of a session (docs/spec.md 3.11): each family holding a place gets a lodging of the
// layout, chosen by its size and needs; below, the layout of the session lodging by lodging. Saving a
// choice sends no email.
const props = defineProps<{ sessionId: string }>()

const api = useApi()
const { data, status, refresh } = useApiFetch<SessionLodgingsDto>(
  () => `/api/admin/sessions/${props.sessionId}/lodgings`,
)

const lodgingById = computed(() => new Map(data.value?.lodgings.map(lodging => [lodging.id, lodging])))
const familyByLodging = computed(
  () =>
    new Map(data.value?.families.flatMap(family => (family.lodgingId ? [[family.lodgingId, family] as const] : []))),
)
const placed = computed(() => data.value?.families.filter(family => family.lodgingId).length ?? 0)
const free = computed(() => (data.value?.lodgings.length ?? 0) - placed.value)

const summary = computed(() => {
  const d = data.value
  if (!d) return undefined
  const families = d.families.length
  return [
    families && `${placed.value} ${families === 1 ? 'famiglia' : 'famiglie'} su ${families} con un alloggio`,
    plural(free.value, 'alloggio libero', 'alloggi liberi'),
  ]
    .filter(Boolean)
    .join(' · ')
})

const features = (lodging: Pick<Lodging, 'features'>) =>
  lodging.features.map(feature => enumMeta('lodgingFeature', feature).label).join(', ')
const beds = (n: number) => plural(n, 'posto letto', 'posti letto')

/** The lodgings of the layout, by area, the ones of other families named and not selectable. */
function lodgingItems(family: SessionLodgingFamily): SelectMenuItem[][] {
  const groups = new Map<string, SelectMenuItem[]>()
  for (const lodging of data.value?.lodgings ?? []) {
    const holder = familyByLodging.value.get(lodging.id)
    const taken = holder && holder.id !== family.id
    const area = lodging.area ?? 'Altri alloggi'
    if (!groups.has(area)) groups.set(area, [{ type: 'label', label: area }])
    groups.get(area)!.push({
      label: lodging.name,
      value: lodging.id,
      description: taken
        ? `Assegnato a ${holder.familyName}`
        : [beds(lodging.beds), features(lodging)].filter(Boolean).join(' · '),
      disabled: taken,
    })
  }
  return [...groups.values()]
}

const saving = ref<string | null>(null)
async function assign(family: SessionLodgingFamily, lodgingId: string | null | undefined) {
  if ((lodgingId ?? null) === family.lodgingId) return
  saving.value = family.id
  try {
    const url: string = `/api/admin/sessions/${props.sessionId}/lodgings/${family.id}`
    await api(url, { method: 'PUT', body: { lodgingId: lodgingId ?? null } })
  } catch (error) {
    notifyError(error, 'Alloggio non assegnato')
  } finally {
    await refresh()
    saving.value = null
  }
}

const warningsOf = (family: SessionLodgingFamily) => {
  const lodging = family.lodgingId ? lodgingById.value.get(family.lodgingId) : undefined
  return lodging ? lodgingWarnings(family, lodging) : []
}

/** The layout of the session, by area: each lodging with its family. */
const layout = computed(() => {
  const groups = new Map<string, { lodging: Lodging; family?: SessionLodgingFamily; warnings: string[] }[]>()
  for (const lodging of data.value?.lodgings ?? []) {
    const family = familyByLodging.value.get(lodging.id)
    const area = lodging.area ?? 'Altri alloggi'
    if (!groups.has(area)) groups.set(area, [])
    groups.get(area)!.push({ lodging, family, warnings: family ? lodgingWarnings(family, lodging) : [] })
  }
  return [...groups.entries()].map(([area, items]) => ({ area, items }))
})
</script>

<template>
  <div>
    <div v-if="!data && status === 'pending'" class="space-y-3" aria-busy="true">
      <USkeleton class="h-6 w-64" />
      <USkeleton class="h-32 w-full" />
    </div>

    <UAlert
      v-else-if="!data"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Non riesco a caricare gli alloggi della sessione"
      description="Controlla la connessione e riprova."
      :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: () => refresh() }]"
    />

    <UEmpty
      v-else-if="!data.lodgings.length"
      icon="i-lucide-bed-double"
      title="Ancora nessun alloggio"
      description="Inserisci lo schema dei posti letto del camp: lo fai una volta sola e vale per tutte le sessioni."
      :actions="[{ label: 'Inserisci gli alloggi', icon: 'i-lucide-plus', to: '/admin/alloggi' }]"
    />

    <template v-else>
      <IcSection title="Famiglie e alloggi" :description="summary">
        <template #actions>
          <UButton
            class="pointer-coarse:min-h-11"
            to="/admin/alloggi"
            icon="i-lucide-bed-double"
            label="Schema dei posti letto"
            color="neutral"
            variant="ghost"
          />
          <UButton
            class="pointer-coarse:min-h-11"
            :to="`/api/admin/sessions/${sessionId}/lodgings/export`"
            external
            download
            icon="i-lucide-download"
            label="Scarica lo schema (CSV)"
            color="neutral"
            variant="outline"
          />
        </template>

        <UAlert
          v-if="!data.editable"
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          title="La sessione è conclusa o annullata"
          description="Gli alloggi restano qui per lo storico e non si possono più cambiare."
          class="mb-6"
        />

        <UEmpty
          v-if="!data.families.length"
          icon="i-lucide-heart-handshake"
          title="Nessuna famiglia con un posto"
          description="Qui compaiono le famiglie titolari della sessione, finché non rinunciano: le riserve ricevono un alloggio quando vengono chiamate."
        />

        <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li
            v-for="family in data.families"
            :key="family.id"
            class="flex flex-col gap-3 p-4 md:flex-row md:items-start md:justify-between"
          >
            <div class="min-w-0 space-y-1">
              <div class="flex flex-wrap items-center gap-2">
                <ULink
                  :to="`/admin/famiglie/${family.familyId}`"
                  class="font-semibold text-highlighted hover:underline"
                >
                  {{ family.familyName }}
                </ULink>
                <IcStatusBadge kind="participationStatus" :value="family.status" />
              </div>
              <p class="text-sm text-muted">
                {{ family.people ? plural(family.people, 'persona', 'persone') : 'Componenti non ancora indicati' }}
                <template v-if="family.needs.length"> · Esigenze: {{ features({ features: family.needs }) }} </template>
              </p>
              <p
                v-for="warning in warningsOf(family)"
                :key="warning"
                class="flex items-start gap-1.5 text-sm text-warning"
              >
                <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {{ warning }}
              </p>
            </div>
            <UFormField label="Alloggio" class="w-full shrink-0 md:w-72">
              <USelectMenu
                :model-value="family.lodgingId ?? undefined"
                :items="lodgingItems(family)"
                value-key="value"
                placeholder="Nessun alloggio"
                :search-input="data.lodgings.length > 8 ? { placeholder: 'Cerca un alloggio' } : false"
                :disabled="!data.editable || saving !== null"
                :loading="saving === family.id"
                clear
                class="w-full"
                @update:model-value="value => assign(family, value as string | null | undefined)"
              />
            </UFormField>
          </li>
        </ul>
      </IcSection>

      <IcSection
        title="Schema della sessione"
        description="Alloggio per alloggio, chi ci dorme: è lo schema che scarichi in CSV."
      >
        <div v-for="group in layout" :key="group.area" class="mb-8 last:mb-0">
          <h3 class="mb-3 font-semibold text-highlighted">{{ group.area }}</h3>
          <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <li
              v-for="item in group.items"
              :key="item.lodging.id"
              class="rounded-lg border p-4"
              :class="item.family ? 'border-default bg-elevated' : 'border-dashed border-default'"
            >
              <p class="font-semibold text-highlighted">{{ item.lodging.name }}</p>
              <p class="text-sm text-muted">
                {{ beds(item.lodging.beds)
                }}<template v-if="item.lodging.features.length"> · {{ features(item.lodging) }}</template>
              </p>
              <p v-if="item.lodging.description" class="text-sm text-muted">{{ item.lodging.description }}</p>
              <p v-if="item.family" class="mt-2 flex items-center gap-1.5 text-sm">
                <UIcon name="i-lucide-heart-handshake" class="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span class="font-medium text-default">{{ item.family.familyName }}</span>
                <span class="text-muted">· {{ plural(item.family.people, 'persona', 'persone') }}</span>
              </p>
              <p v-else class="mt-2 text-sm text-muted">Libero</p>
              <p
                v-for="warning in item.warnings"
                :key="warning"
                class="mt-1 flex items-start gap-1.5 text-sm text-warning"
              >
                <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {{ warning }}
              </p>
            </li>
          </ul>
        </div>
      </IcSection>
    </template>
  </div>
</template>
