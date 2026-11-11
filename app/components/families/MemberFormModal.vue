<script setup lang="ts">
import { DISABILITY_FIELDS, memberSchema } from '#shared/schemas/families'
import type { DisabilityInfo } from '#shared/types/domain'
import type { OwnFamilyMember } from '#shared/types/families'
import type { MemberKind, MemberRelationship } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { fullName, isEmptyCard } from '#shared/utils/format'

// Adds or edits a member of the signed-in family. The health fields appear only with the consent
// (docs/spec.md, 3.8); without it the request carries no health data at all.
const props = defineProps<{ member: OwnFamilyMember | null; consent: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

type DisabilityKey = keyof DisabilityInfo

interface State {
  firstName: string
  lastName: string
  birthDate: string
  relationship: MemberRelationship | undefined
  kind: MemberKind | undefined
  isReferent: boolean
  health: { hasDisability: boolean; disability: Record<DisabilityKey, string> }
}

function initialState(member: OwnFamilyMember | null): State {
  const disability = member?.health?.disability ?? {}
  return {
    firstName: member?.firstName ?? '',
    lastName: member?.lastName ?? '',
    birthDate: member?.birthDate ?? '',
    relationship: member?.relationship ?? undefined,
    kind: member?.kind,
    isReferent: member?.isReferent ?? false,
    health: {
      hasDisability: member?.health?.hasDisability ?? false,
      disability: Object.fromEntries(
        DISABILITY_FIELDS.map(field => [field.key, disability[field.key] ?? '']),
      ) as Record<DisabilityKey, string>,
    },
  }
}

const state = reactive<State>(initialState(null))
// What the form held when it opened: health details take time to write, so closing with changes asks first.
const opened = ref('')
watch(open, value => {
  if (!value) return
  Object.assign(state, initialState(props.member))
  opened.value = JSON.stringify(state)
})
const dirty = computed(() => open.value && JSON.stringify(state) !== opened.value)
const confirm = useConfirm()

async function close() {
  if (dirty.value) {
    const ok = await confirm({
      title: 'Chiudi senza salvare?',
      description: 'Quello che hai scritto in questa scheda andrà perso.',
      confirmLabel: 'Chiudi senza salvare',
      cancelLabel: 'Continua a scrivere',
      danger: true,
    })
    if (!ok) return
  }
  open.value = false
}

// A plain yes or no, so whoever has no condition sees at once there is nothing more to write.
const condition = computed({
  get: () => (state.health.hasDisability ? 'yes' : 'no'),
  set: (value: string) => (state.health.hasDisability = value === 'yes'),
})
const conditionItems = [
  { label: 'Sì', value: 'yes' },
  { label: 'No', value: 'no' },
]

const { options } = useEnums()
const relationships = options('memberRelationship')
const kinds = options('memberKind')
const today = todayIso()
const api = useApi()
const saving = ref(false)

/** A card created from the family data and still empty: the family fills it in for the first time. */
const emptyCard = computed(() => Boolean(props.member && isEmptyCard(props.member)))
const title = computed(() => {
  if (!props.member) return 'Aggiungi un componente'
  return emptyCard.value ? 'Compila la scheda' : `Modifica ${fullName(props.member)}`
})

async function save() {
  saving.value = true
  const body = {
    firstName: state.firstName,
    lastName: state.lastName,
    birthDate: state.birthDate || null,
    relationship: state.relationship,
    kind: state.kind,
    isReferent: state.isReferent,
    ...(props.consent
      ? {
          health: {
            hasDisability: state.health.hasDisability,
            disability: state.health.hasDisability ? state.health.disability : null,
          },
        }
      : {}),
  }
  try {
    if (props.member) {
      await api(`/api/family/members/${props.member.id}`, { method: 'PATCH', body })
      notifySuccess(emptyCard.value ? 'Scheda compilata' : 'Dati salvati', fullName(state))
    } else {
      await api('/api/family/members', { method: 'POST', body })
      notifySuccess('Componente aggiunto')
    }
    open.value = false
    emit('saved')
  } catch (error) {
    notifyError(error, 'Dati non salvati')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    description="I campi con l’asterisco sono obbligatori."
    :dismissible="!dirty"
    :close="false"
    :ui="{ content: 'sm:max-w-2xl', wrapper: 'pe-12' }"
  >
    <!-- Not the built-in close: it would close at once, without asking about the changes. -->
    <template #actions>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        aria-label="Chiudi"
        class="absolute end-4 top-4 pointer-coarse:size-11 pointer-coarse:justify-center"
        @click="close"
      />
    </template>
    <template #body>
      <UForm :schema="memberSchema" :state="state" class="space-y-5" @submit="save">
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Nome" name="firstName" required>
            <UInput v-model="state.firstName" autocomplete="off" class="w-full" />
          </UFormField>
          <UFormField label="Cognome" name="lastName" required>
            <UInput v-model="state.lastName" autocomplete="off" class="w-full" />
          </UFormField>
          <UFormField
            label="Data di nascita"
            name="birthDate"
            :required="state.kind === 'adult'"
            :hint="state.kind === 'adult' ? undefined : 'Facoltativo'"
          >
            <UInput v-model="state.birthDate" type="date" :max="today" min="1900-01-01" class="w-full" />
          </UFormField>
          <UFormField label="Parentela" name="relationship" required>
            <USelect
              v-model="state.relationship"
              :items="relationships"
              value-key="value"
              placeholder="Scegli"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField name="kind" required>
          <URadioGroup
            v-model="state.kind"
            :items="kinds"
            value-key="value"
            legend="Nel nucleo familiare è"
            orientation="horizontal"
          />
        </UFormField>
        <UFormField name="isReferent">
          <UCheckbox
            v-model="state.isReferent"
            label="Persona di riferimento"
            description="Chi parla con il camp per organizzare il soggiorno. Può essercene più di una."
          />
        </UFormField>

        <fieldset v-if="consent" class="space-y-5 rounded-lg border border-default p-4">
          <legend class="flex items-center gap-2 px-1 font-semibold text-highlighted">
            <UIcon name="i-lucide-lock" class="size-4 text-muted" aria-hidden="true" />
            Patologie e disabilità
          </legend>
          <URadioGroup
            v-model="condition"
            :items="conditionItems"
            value-key="value"
            orientation="horizontal"
            legend="Ha una patologia grave o cronica, un disturbo del neurosviluppo o una disabilità, anche genetica?"
            :ui="{ legend: 'font-normal text-default' }"
          />
          <p v-if="!state.health.hasDisability" class="text-sm text-muted">Se la risposta è no, non serve altro.</p>
          <template v-else>
            <p class="max-w-prose text-sm text-muted">
              Compila tutti i campi: servono al camp per organizzare il soggiorno. Li vedete solo voi e
              l’amministrazione, e non finiscono mai nelle email. Se in un campo non c’è nulla da segnalare, scrivi
              «niente».
            </p>
            <UFormField
              v-for="field in DISABILITY_FIELDS"
              :key="field.key"
              :label="field.label"
              :help="field.help"
              :name="`health.disability.${field.key}`"
              required
            >
              <UTextarea v-model="state.health.disability[field.key]" autoresize :rows="4" class="w-full" />
            </UFormField>
          </template>
        </fieldset>
        <UAlert
          v-else
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          title="Dati sulla salute"
          description="Per indicare la disabilità e i bisogni di supporto serve prima il tuo consenso: lo trovi in questa pagina, sotto l’elenco dei componenti."
        />

        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <UButton label="Annulla" color="neutral" variant="outline" class="pointer-coarse:min-h-11" @click="close" />
          <UButton
            type="submit"
            :loading="saving"
            :label="member ? 'Salva' : 'Aggiungi'"
            class="pointer-coarse:min-h-11"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
