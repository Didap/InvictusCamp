<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { emptyTurns, programmeBlockSchema } from '#shared/schemas/programmes'
import { copyOf, newBlockId } from '#shared/utils/programme'
import type { ProgrammeBlock, ProgrammeDay, ProgrammeGroupTurn } from '#shared/types/domain'
import { enumMeta, PROGRAMME_GROUP_LABELS, PROGRAMME_GROUPS, type ProgrammeGroup } from '#shared/utils/constants'

// Adds a block (`block` null) or edits one. Changing the day moves the block to that day, in time
// order. A `groups` block asks what each group does, from the programme's list of activities.
const props = defineProps<{
  block: ProgrammeBlock | null
  dayId: string
  days: Pick<ProgrammeDay, 'id' | 'name'>[]
  activities: string[]
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ submit: [value: { dayId: string; block: ProgrammeBlock }] }>()

type State = Omit<ProgrammeBlock, 'groups'> & { groups: Record<ProgrammeGroup, ProgrammeGroupTurn> }

function blank(): State {
  return {
    id: newBlockId(),
    start: '',
    end: '',
    title: '',
    kind: 'everyone',
    note: '',
    staffNote: '',
    lead: '',
    isNew: false,
    toConfirm: false,
    groups: emptyTurns(),
  }
}

const formId = useId()
const state = reactive<State>(blank())
const day = ref(props.dayId)
watch(open, value => {
  if (!value) return
  Object.assign(state, blank(), props.block ? copyOf(props.block) : null)
  day.value = props.dayId
})

const dayItems = computed(() => props.days.map(item => ({ value: item.id, label: item.name })))
const kindItems = useEnums().options('programmeBlockKind')
const kindHelp = computed(() => enumMeta('programmeBlockKind', state.kind).description)

/** The list, plus the current activity if it left the list (so the select still shows it). */
function activityItems(current: string | null) {
  return current && !props.activities.includes(current) ? [...props.activities, current] : props.activities
}

function onSubmit(event: FormSubmitEvent<z.output<typeof programmeBlockSchema>>) {
  emit('submit', { dayId: day.value, block: event.data })
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="block ? 'Modifica il blocco' : 'Nuovo blocco'"
    :ui="{ wrapper: 'pe-12', close: 'pointer-coarse:size-11 pointer-coarse:justify-center' }"
  >
    <template #body>
      <UForm :id="formId" :schema="programmeBlockSchema" :state="state" class="space-y-5" @submit="onSubmit">
        <UFormField label="Titolo" name="title" required>
          <UInput v-model="state.title" :maxlength="120" class="w-full" />
        </UFormField>
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Giorno" name="day">
            <USelect v-model="day" :items="dayItems" class="w-full" />
          </UFormField>
          <UFormField label="Tipo" name="kind" required :help="kindHelp">
            <USelect v-model="state.kind" :items="kindItems" class="w-full" />
          </UFormField>
          <UFormField label="Inizio" name="start" hint="Facoltativo">
            <UInput v-model="state.start" type="time" class="w-full" />
          </UFormField>
          <UFormField label="Fine" name="end" hint="Facoltativo">
            <UInput v-model="state.end" type="time" class="w-full" />
          </UFormField>
        </div>

        <fieldset v-if="state.kind === 'groups'" class="space-y-4">
          <legend class="mb-2 text-sm font-medium text-highlighted">Che cosa fa ogni gruppo</legend>
          <p v-if="!activities.length" class="text-sm text-muted">
            Aggiungi le attività nella lista «Attività a rotazione» per sceglierle qui.
          </p>
          <div v-for="group in PROGRAMME_GROUPS" :key="group" class="grid gap-3 sm:grid-cols-2">
            <UFormField :name="`groups.${group}.activity`">
              <template #label>
                <span class="flex items-center gap-2">
                  <ProgrammeGroupDot :group="group" />
                  {{ PROGRAMME_GROUP_LABELS[group] }}
                </span>
              </template>
              <USelectMenu
                v-model="state.groups[group].activity"
                :items="activityItems(state.groups[group].activity)"
                placeholder="Da definire"
                :search-input="false"
                clear
                class="w-full"
              />
            </UFormField>
            <UFormField :label="`Chi conduce, ${PROGRAMME_GROUP_LABELS[group]}`" hint="Facoltativo">
              <UInput v-model="state.groups[group].lead" :maxlength="120" class="w-full" />
            </UFormField>
          </div>
        </fieldset>
        <UFormField v-else label="Chi lo conduce" name="lead" hint="Facoltativo">
          <UInput v-model="state.lead" :maxlength="120" class="w-full" />
        </UFormField>

        <UFormField
          label="Nota"
          name="note"
          hint="Facoltativo"
          help="La leggono le famiglie e lo staff della sessione."
        >
          <UTextarea v-model="state.note" :rows="2" :maxlength="500" autoresize class="w-full" />
        </UFormField>
        <UFormField
          label="Nota interna"
          name="staffNote"
          hint="Facoltativo"
          help="La leggono l’amministrazione e lo staff, mai le famiglie."
        >
          <UTextarea v-model="state.staffNote" :rows="2" :maxlength="500" autoresize class="w-full" />
        </UFormField>
        <div class="space-y-3">
          <UCheckbox
            v-model="state.toConfirm"
            label="Da confermare"
            description="Famiglie e staff lo vedono con l’etichetta «Da confermare»."
          />
          <UCheckbox
            v-model="state.isNew"
            label="Novità rispetto all’anno prima"
            description="Lo vede solo l’amministrazione."
          />
        </div>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          label="Annulla"
          class="pointer-coarse:min-h-11"
          @click="open = false"
        />
        <UButton
          type="submit"
          :form="formId"
          :label="block ? 'Applica' : 'Aggiungi il blocco'"
          class="pointer-coarse:min-h-11"
        />
      </div>
    </template>
  </UModal>
</template>
