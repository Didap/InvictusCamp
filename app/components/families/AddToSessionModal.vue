<script setup lang="ts">
import type { AddFamiliesResult, SessionListItem } from '#shared/types/sessions'
import { enumLabel, type ParticipationKind } from '#shared/utils/constants'
import { formatDayRange, plural } from '#shared/utils/format'

// "Aggiungi a una sessione" on the admin family record: a session in preparation or open, as
// titolare or reserve, through A1's POST /api/admin/sessions/:id/families. Says first whether an
// email leaves (sessions with open invitations invite at once, drafts send nothing: spec 3.2).
const props = defineProps<{ familyId: string; familyName: string; activeSessionIds: string[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ added: [] }>()

const api = useApi()
const sessions = ref<SessionListItem[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const sessionId = ref<string>()
const kind = ref<ParticipationKind>('slot')
const saving = ref(false)

async function load() {
  loading.value = true
  loadFailed.value = false
  try {
    sessions.value = await api<SessionListItem[]>('/api/admin/sessions', {
      query: { status: 'draft,inviting,confirmed' },
    })
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

watch(open, value => {
  if (!value) return
  sessionId.value = undefined
  kind.value = 'slot'
  load()
})

const sessionItems = computed(() =>
  sessions.value.map(session => {
    const already = props.activeSessionIds.includes(session.id)
    const places = `${plural(session.slots.free, 'posto libero', 'posti liberi')} su ${session.slots.total}`
    return {
      value: session.id,
      label: session.title,
      description: [
        formatDayRange(session.startDate, session.endDate),
        enumLabel('sessionStatus', session.status),
        already ? 'la famiglia è già in questa sessione' : places,
      ].join(' · '),
      disabled: already,
    }
  }),
)

const chosen = computed(() => sessions.value.find(session => session.id === sessionId.value))
const noPlaces = computed(() => chosen.value !== undefined && chosen.value.slots.free <= 0)
watch(noPlaces, full => {
  if (full) kind.value = 'reserve'
})

const kindItems = computed(() => [
  {
    value: 'slot',
    label: 'Titolare',
    description: noPlaces.value ? 'Nessun posto libero in questa sessione' : 'Occupa uno dei posti della sessione',
    disabled: noPlaces.value,
  },
  { value: 'reserve', label: 'Riserva', description: 'Viene chiamata, in ordine, quando si libera un posto' },
])

const emailNote = computed(() => {
  const session = chosen.value
  if (!session) return null
  if (session.status === 'draft') {
    return {
      color: 'neutral' as const,
      icon: 'i-lucide-mail-x',
      title: 'Nessuna email per ora',
      description: 'La sessione è in bozza: la famiglia riceverà l’email quando si apriranno gli inviti.',
    }
  }
  return {
    color: 'info' as const,
    icon: 'i-lucide-send',
    title: 'Partirà 1 email',
    description:
      kind.value === 'slot'
        ? `${props.familyName} riceverà subito l’invito e potrà confermare o rinunciare.`
        : `${props.familyName} riceverà subito un’email: è in lista di riserva.`,
  }
})

async function add() {
  const session = chosen.value
  if (!session) return
  saving.value = true
  try {
    const result = await api<AddFamiliesResult>(`/api/admin/sessions/${session.id}/families`, {
      method: 'POST',
      body: { familyIds: [props.familyId], kind: kind.value },
    })
    if (!result.added) {
      notifySuccess('Nessuna modifica', `${props.familyName} era già in «${session.title}».`)
    } else {
      notifySuccess(
        `Aggiunta come ${kind.value === 'slot' ? 'titolare' : 'riserva'}`,
        result.invited
          ? `${props.familyName} è in «${session.title}»: email inviata.`
          : `${props.familyName} è in «${session.title}».`,
      )
    }
    open.value = false
    emit('added')
  } catch (error) {
    notifyError(error, 'Famiglia non aggiunta')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Aggiungi a una sessione"
    :description="`Scegli la sessione e il ruolo di ${familyName}.`"
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <div class="space-y-6">
        <div v-if="loading" class="space-y-3" aria-busy="true">
          <USkeleton v-for="n in 3" :key="n" class="h-16 w-full" />
        </div>
        <UAlert
          v-else-if="loadFailed"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Non riesco a caricare le sessioni"
          :actions="[{ label: 'Riprova', color: 'error', variant: 'outline', onClick: load }]"
        />
        <UEmpty
          v-else-if="!sessions.length"
          icon="i-lucide-calendar-x"
          title="Nessuna sessione aperta"
          description="Le famiglie si aggiungono alle sessioni in bozza, con gli inviti aperti o confermate."
          :actions="[{ label: 'Crea una sessione', icon: 'i-lucide-plus', to: '/admin/sessioni/nuova' }]"
        />
        <template v-else>
          <URadioGroup v-model="sessionId" legend="Sessione" :items="sessionItems" variant="card" />
          <URadioGroup
            v-if="chosen"
            v-model="kind"
            legend="Ruolo"
            :items="kindItems"
            variant="card"
            orientation="horizontal"
            :ui="{ fieldset: 'grid gap-2 sm:grid-cols-2' }"
          />
          <UAlert
            v-if="emailNote"
            :color="emailNote.color"
            variant="subtle"
            :icon="emailNote.icon"
            :title="emailNote.title"
            :description="emailNote.description"
          />
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton label="Annulla" color="neutral" variant="outline" @click="open = false" />
        <UButton
          :label="kind === 'slot' ? 'Aggiungi come titolare' : 'Aggiungi come riserva'"
          :disabled="!chosen"
          :loading="saving"
          @click="add"
        />
      </div>
    </template>
  </UModal>
</template>
