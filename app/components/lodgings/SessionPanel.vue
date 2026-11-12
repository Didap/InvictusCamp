<script setup lang="ts">
import type { SelectMenuItem } from '@nuxt/ui'
import type { SessionLodgingFamily, SessionLodgingsDto } from '#shared/types/lodgings'
import { plural } from '#shared/utils/format'
import { featureLabels, groupByArea, lodgingWarnings } from '#shared/utils/lodgings'

// The Alloggi tab of a session (docs/spec.md 3.11): each titolare holding a place gets a lodging of the
// layout, chosen by its size and needs; below, the layout of the session lodging by lodging. Saving a
// choice sends no email.
const props = defineProps<{ sessionId: string }>()

const api = useApi()
const { data, status, refresh } = useApiFetch<SessionLodgingsDto>(
  () => `/api/admin/sessions/${props.sessionId}/lodgings`,
)

const familyByLodging = computed(
  () =>
    new Map(data.value?.families.flatMap(family => (family.lodgingId ? [[family.lodgingId, family] as const] : []))),
)

const summary = computed(() => {
  const d = data.value
  if (!d) return undefined
  const families = d.families.length
  const placed = familyByLodging.value.size
  return [
    families && `${placed} ${families === 1 ? 'famiglia' : 'famiglie'} su ${families} con un alloggio`,
    plural(d.lodgings.length - placed, 'alloggio libero', 'alloggi liberi'),
  ]
    .filter(Boolean)
    .join(' · ')
})

const beds = (n: number) => plural(n, 'posto letto', 'posti letto')
/** How many people: without cards the beds cannot be checked, and the page says so. */
const people = (family: SessionLodgingFamily) =>
  family.people ? plural(family.people, 'persona', 'persone') : 'Componenti non ancora indicati'

/** The layout of the session, by area: each lodging with its family and what does not fit. */
const layout = computed(() =>
  groupByArea(
    (data.value?.lodgings ?? []).map(lodging => {
      const family = familyByLodging.value.get(lodging.id)
      return { ...lodging, family, warnings: family ? lodgingWarnings(family, lodging) : [] }
    }),
  ),
)

/** The choices of each family: the lodgings by area, those of other families named and not selectable. */
const choices = computed(() => {
  const result = new Map<string, SelectMenuItem[][]>()
  for (const family of data.value?.families ?? []) {
    result.set(
      family.id,
      layout.value.map(group => [
        { type: 'label', label: group.area },
        ...group.items.map(lodging => {
          const taken = lodging.family && lodging.family.id !== family.id
          return {
            label: lodging.name,
            value: lodging.id,
            description: taken
              ? `Assegnato a ${lodging.family!.familyName}`
              : [beds(lodging.beds), featureLabels(lodging.features)].filter(Boolean).join(' · '),
            disabled: taken,
          }
        }),
      ]),
    )
  }
  return result
})

const warningsOf = computed(
  () =>
    new Map(
      layout.value.flatMap(group =>
        group.items.flatMap(item => (item.family ? [[item.family.id, item.warnings] as const] : [])),
      ),
    ),
)

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
                {{ people(family) }}
                <template v-if="family.needs.length"> · Esigenze: {{ featureLabels(family.needs) }}</template>
              </p>
              <p
                v-for="warning in warningsOf.get(family.id) ?? []"
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
                :items="choices.get(family.id) ?? []"
                value-key="value"
                placeholder="Nessun alloggio"
                :search-input="data.lodgings.length > 8 ? { placeholder: 'Cerca un alloggio' } : false"
                :disabled="!data.editable || saving !== null"
                :loading="saving === family.id"
                :aria-label="`Alloggio di ${family.familyName}`"
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
              :key="item.id"
              class="rounded-lg border p-4"
              :class="item.family ? 'border-default bg-elevated' : 'border-dashed border-default'"
            >
              <p class="font-semibold text-highlighted">{{ item.name }}</p>
              <p class="text-sm text-muted">
                {{ beds(item.beds)
                }}<template v-if="item.features.length"> · {{ featureLabels(item.features) }}</template>
              </p>
              <p v-if="item.description" class="text-sm text-muted">{{ item.description }}</p>
              <p v-if="item.family" class="mt-2 flex items-center gap-1.5 text-sm">
                <UIcon name="i-lucide-heart-handshake" class="size-4 shrink-0 text-muted" aria-hidden="true" />
                <span class="font-medium text-default">{{ item.family.familyName }}</span>
                <span class="text-muted">· {{ people(item.family) }}</span>
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
