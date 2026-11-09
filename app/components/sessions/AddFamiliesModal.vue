<script setup lang="ts">
import type { AddFamiliesResult, SessionCandidate } from '#shared/types/sessions'
import type { ParticipationKind } from '#shared/utils/constants'
import { enumLabel } from '#shared/utils/constants'
import { plural } from '#shared/utils/format'

// "Aggiungi famiglie": search the families not yet in the session, pick some, add them as titolari
// (never beyond the free places) or as reserves (at the end of the list). While the session is open
// they are invited at once: the confirmation says how many emails leave.
const props = defineProps<{ sessionId: string; free: number; invites: boolean; initialKind?: ParticipationKind }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [result: AddFamiliesResult] }>()

const api = useApi()
const confirm = useConfirm()
const kind = ref<ParticipationKind>('slot')
const search = ref('')
const selected = ref<string[]>([])
const saving = ref(false)

const {
  data: candidates,
  status,
  error,
  refresh,
} = useApiFetch<SessionCandidate[]>(() => `/api/admin/sessions/${props.sessionId}/candidates`, {
  immediate: false,
})

watch(open, value => {
  if (!value) return
  selected.value = []
  search.value = ''
  kind.value = props.initialKind ?? (props.free > 0 ? 'slot' : 'reserve')
  if (kind.value === 'slot' && props.free === 0) kind.value = 'reserve'
  refresh()
})

const kindItems = computed(() => [
  {
    value: 'slot',
    label: 'Come titolari',
    description:
      props.free > 0
        ? `Occupano un posto: ${props.free === 1 ? 'ne resta 1' : `ne restano ${props.free}`}.`
        : 'Non ci sono posti liberi.',
    disabled: props.free === 0,
  },
  {
    value: 'reserve',
    label: 'Come riserve',
    description: 'Vanno in fondo alla lista e le chiami quando si libera un posto.',
  },
])

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const filtered = computed(() => {
  const query = normalize(search.value.trim())
  return (candidates.value ?? []).filter(
    candidate => !query || normalize(`${candidate.name} ${candidate.referent} ${candidate.city ?? ''}`).includes(query),
  )
})

const items = computed(() =>
  filtered.value.map(candidate => ({
    value: candidate.id,
    label: candidate.name,
    description: [
      candidate.referent,
      candidate.city ? `${candidate.city}${candidate.province ? ` (${candidate.province})` : ''}` : null,
      `Scheda: ${enumLabel('familyFormStatus', candidate.formStatus).toLowerCase()}`,
      candidate.previousStatus
        ? `In questa sessione: ${enumLabel('participationStatus', candidate.previousStatus).toLowerCase()}`
        : null,
    ]
      .filter(Boolean)
      .join(' · '),
  })),
)

const tooMany = computed(() => kind.value === 'slot' && selected.value.length > props.free)

async function submit() {
  const count = selected.value.length
  if (!count || tooMany.value) return
  const families = plural(count, 'famiglia', 'famiglie')
  if (props.invites) {
    const ok = await confirm({
      title: `Aggiungi ${families} ${kind.value === 'slot' ? 'come titolari' : 'come riserve'}?`,
      description: `La sessione ha gli inviti aperti: ${count === 1 ? 'la famiglia riceve' : 'le famiglie ricevono'} subito ${
        kind.value === 'slot' ? 'l’invito a confermare' : 'l’avviso di essere in lista di riserva'
      }. ${count === 1 ? 'Partirà 1 email.' : `Partiranno ${count} email.`}`,
      confirmLabel: 'Aggiungi e invia',
    })
    if (!ok) return
  }
  saving.value = true
  try {
    const result = await api<AddFamiliesResult>(`/api/admin/sessions/${props.sessionId}/families`, {
      method: 'POST',
      body: { familyIds: selected.value, kind: kind.value },
    })
    notifySuccess(
      `${plural(result.added, 'famiglia aggiunta', 'famiglie aggiunte')}`,
      result.invited
        ? `${plural(result.invited, 'email inviata', 'email inviate')}.`
        : 'La sessione è in bozza: riceveranno l’invito quando apri gli inviti.',
    )
    open.value = false
    emit('added', result)
  } catch (error) {
    notifyError(error, 'Famiglie non aggiunte')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Aggiungi famiglie"
    description="Cerca le famiglie e scegli come aggiungerle alla sessione."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-6">
        <URadioGroup v-model="kind" :items="kindItems" legend="Come le aggiungi" variant="card" />

        <div class="space-y-3">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Cerca per famiglia, referente o città"
            aria-label="Cerca una famiglia"
            class="w-full"
          />
          <UAlert
            v-if="error"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            title="Non riesco a caricare le famiglie"
            :description="apiErrorMessage(error)"
          />
          <p v-else-if="status === 'pending' && !candidates?.length" class="text-sm text-muted">Carico le famiglie…</p>
          <p v-else-if="!items.length" class="text-sm text-muted">
            {{
              search
                ? 'Nessuna famiglia corrisponde alla ricerca.'
                : 'Tutte le famiglie con un account attivo sono già nella sessione.'
            }}
          </p>
          <div v-else class="max-h-80 overflow-y-auto rounded-lg border border-default p-3">
            <UCheckboxGroup v-model="selected" :items="items" legend="Famiglie" :ui="{ fieldset: 'gap-y-3' }" />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-sm" :class="tooMany ? 'font-semibold text-error' : 'text-muted'" aria-live="polite">
          <template v-if="tooMany">
            Restano {{ plural(free, 'posto libero', 'posti liberi') }}: scegline meno o aggiungile come riserve.
          </template>
          <template v-else>{{ plural(selected.length, 'famiglia scelta', 'famiglie scelte') }}</template>
        </p>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton color="neutral" variant="outline" label="Annulla" @click="open = false" />
          <UButton
            :label="selected.length ? `Aggiungi ${plural(selected.length, 'famiglia', 'famiglie')}` : 'Aggiungi'"
            :disabled="!selected.length || tooMany"
            :loading="saving"
            @click="submit"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
