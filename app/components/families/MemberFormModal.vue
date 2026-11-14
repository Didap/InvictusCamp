<script setup lang="ts">
import {
  ALLERGIES,
  DIETS,
  DISABILITY_CHOICES,
  HEALTH_LABELS,
  type Choice,
  type DisabilityChoiceKey,
} from '#shared/content/member-form'
import { memberSchema } from '#shared/schemas/families'
import type { OwnFamilyMember } from '#shared/types/families'
import { YES_NO_ITEMS, type MemberKind, type MemberRelationship } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { fullName, isEmptyCard, isYoungWithCondition } from '#shared/utils/format'

// Adds or edits a member of the signed-in family. The health fields appear only with the consent
// (docs/spec.md, 3.8); without it the request carries no health data at all.
// The options as plain strings, once: the form holds the keys before the schema checks them.
const DISABILITY_FIELDS = DISABILITY_CHOICES.map(field => ({ ...field, items: [...field.options] as Choice[] }))
/** Lists of choices in two columns from the tablet up. */
const CHOICES_UI = { legend: 'sr-only', fieldset: 'grid gap-2 sm:grid-cols-2' }

const props = defineProps<{
  member: OwnFamilyMember | null
  consent: boolean
  /** The first names of the young people with a condition, «Luca e Sara»: the relationship is to them. */
  reference: string
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ saved: [] }>()

interface State {
  firstName: string
  lastName: string
  birthDate: string
  relationship: MemberRelationship | undefined
  kind: MemberKind | undefined
  isReferent: boolean
  health: {
    hasDisability: boolean
    disability: Record<DisabilityChoiceKey, string[]> & { foodSelectivity: string; notes: string }
    info: { allergies: string[]; diet: string; notes: string }
  }
}

function initialState(member: OwnFamilyMember | null): State {
  const disability = member?.health?.disability ?? {}
  const info = member?.health?.info ?? {}
  return {
    firstName: member?.firstName ?? '',
    lastName: member?.lastName ?? '',
    birthDate: member?.birthDate ?? '',
    relationship: member?.relationship ?? undefined,
    kind: member?.kind,
    isReferent: member?.isReferent ?? false,
    health: {
      hasDisability: member?.health?.hasDisability ?? false,
      disability: {
        ...(Object.fromEntries(
          DISABILITY_CHOICES.map(field => [field.key, [...(disability[field.key] ?? [])]]),
        ) as Record<DisabilityChoiceKey, string[]>),
        foodSelectivity: disability.foodSelectivity ?? '',
        notes: disability.notes ?? '',
      },
      info: { allergies: [...(info.allergies ?? [])], diet: info.diet ?? '', notes: info.notes ?? '' },
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

const { options } = useEnums()
const relationships = options('memberRelationship')
const kinds = options('memberKind')
const today = todayIso()
const dietItems: Choice[] = [{ value: '', label: 'Nessuna' }, ...DIETS]
/**
 * Only a young person can be the one with a condition (an adult's card asks none of it), and that is the
 * person the others' relationship refers to: no relationship of their own.
 */
const withCondition = computed(() =>
  isYoungWithCondition({ kind: state.kind ?? 'adult', hasDisability: state.health.hasDisability }),
)
const birthDateRequired = computed(() => state.kind === 'adult' || withCondition.value)
const relationshipLabel = computed(
  () =>
    `Legame di parentela rispetto ${props.reference ? `a ${props.reference}` : 'al ragazzo o alla ragazza con patologia o disabilità'}`,
)
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
    relationship: withCondition.value ? null : state.relationship,
    kind: state.kind,
    isReferent: state.isReferent,
    ...(props.consent
      ? {
          health: {
            hasDisability: withCondition.value,
            disability: withCondition.value ? state.health.disability : null,
            info: state.health.info,
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
            :required="birthDateRequired"
            :hint="birthDateRequired ? undefined : 'Facoltativo'"
          >
            <UInput v-model="state.birthDate" type="date" :max="today" min="1900-01-01" class="w-full" />
          </UFormField>
          <UFormField v-if="!withCondition" :label="relationshipLabel" name="relationship" required>
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

        <template v-if="consent">
          <!-- Only a young person can be the one with a condition: adults and siblings get «Informazioni utili». -->
          <fieldset v-if="state.kind === 'young'" class="space-y-5 rounded-lg border border-default p-4">
            <legend class="flex items-center gap-2 px-1 font-semibold text-highlighted">
              <UIcon name="i-lucide-lock" class="size-4 text-muted" aria-hidden="true" />
              Patologie e disabilità
            </legend>
            <URadioGroup
              v-model="state.health.hasDisability"
              :items="YES_NO_ITEMS"
              value-key="value"
              orientation="horizontal"
              legend="Ha una patologia grave o cronica, un disturbo del neurosviluppo o una disabilità, anche genetica?"
              :ui="{ legend: 'font-normal text-default' }"
            />
            <template v-if="withCondition">
              <p class="max-w-prose text-sm text-muted">
                Scegli tutte le risposte che valgono: servono al camp per organizzare il soggiorno. Le vedete solo voi e
                l’amministrazione, e non finiscono mai nelle email.
              </p>
              <UFormField
                v-for="field in DISABILITY_FIELDS"
                :key="field.key"
                :label="field.label"
                :name="`health.disability.${field.key}`"
                required
              >
                <UCheckboxGroup
                  v-model="state.health.disability[field.key]"
                  :items="field.items"
                  :legend="field.label"
                  :ui="CHOICES_UI"
                />
              </UFormField>
              <UFormField
                :label="HEALTH_LABELS.foodSelectivity"
                name="health.disability.foodSelectivity"
                help="Cosa mangia volentieri e cosa rifiuta, consistenze, temperature, abitudini a tavola."
                hint="Facoltativo"
              >
                <UTextarea v-model="state.health.disability.foodSelectivity" autoresize :rows="3" class="w-full" />
              </UFormField>
              <UFormField :label="HEALTH_LABELS.notes" name="health.disability.notes" hint="Facoltativo">
                <UTextarea v-model="state.health.disability.notes" autoresize :rows="2" class="w-full" />
              </UFormField>
            </template>
          </fieldset>

          <fieldset class="space-y-5 rounded-lg border border-default p-4">
            <legend class="flex items-center gap-2 px-1 font-semibold text-highlighted">
              <UIcon name="i-lucide-utensils" class="size-4 text-muted" aria-hidden="true" />
              Informazioni utili su {{ state.firstName.trim() || 'questa persona' }}
            </legend>
            <UFormField :label="HEALTH_LABELS.allergies" name="health.info.allergies" hint="Facoltativo">
              <UCheckboxGroup
                v-model="state.health.info.allergies"
                :items="ALLERGIES"
                :legend="HEALTH_LABELS.allergies"
                :ui="CHOICES_UI"
              />
            </UFormField>
            <UFormField :label="HEALTH_LABELS.diet" name="health.info.diet">
              <URadioGroup
                v-model="state.health.info.diet"
                :items="dietItems"
                :legend="HEALTH_LABELS.diet"
                orientation="horizontal"
                :ui="{ legend: 'sr-only', fieldset: 'flex-wrap gap-x-4 gap-y-2' }"
              />
            </UFormField>
            <UFormField :label="HEALTH_LABELS.infoNotes" name="health.info.notes" hint="Facoltativo">
              <UTextarea v-model="state.health.info.notes" autoresize :rows="2" class="w-full" />
            </UFormField>
          </fieldset>
        </template>
        <UAlert
          v-else
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          title="Dati sulla salute"
          description="Per indicare allergie, intolleranze e, per i ragazzi, patologie e disabilità serve prima il tuo consenso: lo trovi in questa pagina, sotto l’elenco dei componenti."
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
