<script setup lang="ts">
import type { SelectMenuItem } from '@nuxt/ui'
import type { Lodging, SessionLodgingFamily, SessionLodgingsDto } from '#shared/types/lodgings'
import { plural } from '#shared/utils/format'
import { NO_CARDS, bedsLabel, featureLabels, groupByArea, placeFamilies } from '#shared/utils/lodgings'

// The Alloggi tab of a session (docs/spec.md 3.11): each titolare holding a place gets a lodging of the
// layout, chosen by its size and needs; below, the layout of the session lodging by lodging. Saving a
// choice sends no email.
const props = defineProps<{ sessionId: string }>()

const api = useApi()
const { data, status, refresh } = useApiFetch<SessionLodgingsDto>(
  () => `/api/admin/sessions/${props.sessionId}/lodgings`,
)

/** Each lodging with its family and what does not fit. */
const placed = computed(() => (data.value ? placeFamilies(data.value.lodgings, data.value.families) : []))
/** The layout of the session, by area. */
const layout = computed(() => groupByArea(placed.value))
const warningsOf = computed(
  () => new Map(placed.value.flatMap(item => (item.family ? [[item.family.id, item.warnings] as const] : []))),
)

const summary = computed(() => {
  const families = data.value?.families.length ?? 0
  const taken = placed.value.filter(item => item.family).length
  return [
    families && `${taken} su ${plural(families, 'famiglia', 'famiglie')} con un alloggio`,
    plural(placed.value.length - taken, 'alloggio libero', 'alloggi liberi'),
  ]
    .filter(Boolean)
    .join(' · ')
})

/** "4 posti letto · Cucina, Microonde". */
const lodgingLine = (lodging: Lodging) =>
  [bedsLabel(lodging.beds), featureLabels(lodging.features)].filter(Boolean).join(' · ')
const people = (family: SessionLodgingFamily) =>
  family.people ? plural(family.people, 'persona', 'persone') : NO_CARDS

/** The choices of each family: the lodgings by area, those of other families named and not selectable. */
const choices = computed(() => {
  const groups = layout.value.map(group => ({
    area: group.area,
    items: group.items.map(item => ({ item, line: lodgingLine(item) })),
  }))
  return new Map<string, SelectMenuItem[][]>(
    (data.value?.families ?? []).map(family => [
      family.id,
      groups.map(group => [
        { type: 'label', label: group.area },
        ...group.items.map(({ item, line }) => {
          const holder = item.family?.id === family.id ? undefined : item.family
          return {
            label: item.name,
            value: item.id,
            description: holder ? `Assegnato a ${holder.familyName}` : line,
            disabled: !!holder,
          }
        }),
      ]),
    ]),
  )
})

const saving = ref<string | null>(null)
async function assign(family: SessionLodgingFamily, value: string | null | undefined) {
  const lodgingId = value ?? null
  if (lodgingId === family.lodgingId) return
  saving.value = family.id
  try {
    const url: string = `/api/admin/sessions/${props.sessionId}/lodgings/${family.id}`
    data.value = await api<SessionLodgingsDto>(url, { method: 'PUT', body: { lodgingId } })
  } catch (error) {
    notifyError(error, 'Alloggio non assegnato')
    await refresh()
  } finally {
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
              <p class="text-sm text-muted">{{ lodgingLine(item) }}</p>
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
