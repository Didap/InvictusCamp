<script setup lang="ts">
import type { ProgrammeSaveInput } from '#shared/schemas/programmes'
import type { SessionProgrammeDto } from '#shared/types/programmes'

// The Programma tab of a session: the programme of its year (read here, edited in /admin/programma),
// or a copy of its own, edited here and valid for this session only.
const props = defineProps<{ sessionId: string }>()

const api = useApi()
const confirm = useConfirm()
const url = computed(() => `/api/admin/sessions/${props.sessionId}/programme`)
const { data, error, refresh } = await useApiFetch<SessionProgrammeDto>(() => url.value)

const busy = ref(false)
async function makeCopy() {
  busy.value = true
  try {
    const target: string = url.value
    data.value = await api<SessionProgrammeDto>(target, { method: 'POST' })
    notifySuccess('Copia creata', 'Le modifiche a questa copia valgono solo per questa sessione.')
  } catch (err) {
    notifyError(err, 'Copia non creata')
  } finally {
    busy.value = false
  }
}

async function dropCopy() {
  if (!data.value) return
  const ok = await confirm({
    title: `Tornare al programma del ${data.value.year}?`,
    description: `La copia di questa sessione si cancella, con le sue modifiche. La sessione userà il programma del ${data.value.year}.`,
    confirmLabel: 'Cancella la copia',
    danger: true,
  })
  if (!ok) return
  busy.value = true
  try {
    const target: string = url.value
    data.value = await api<SessionProgrammeDto>(target, { method: 'DELETE' })
    notifySuccess(`La sessione usa il programma del ${data.value.year}`)
  } catch (err) {
    notifyError(err, 'Copia non cancellata')
  } finally {
    busy.value = false
  }
}

async function save(body: ProgrammeSaveInput) {
  const target: string = url.value
  data.value = await api<SessionProgrammeDto>(target, { method: 'PUT', body })
}
</script>

<template>
  <UAlert
    v-if="error"
    color="error"
    variant="subtle"
    icon="i-lucide-circle-alert"
    title="Non riesco a caricare il programma"
    :description="apiErrorMessage(error)"
    :actions="[{ label: 'Riprova', color: 'neutral', variant: 'outline', onClick: () => refresh() }]"
  />

  <template v-else-if="data">
    <UEmpty
      v-if="data.source === 'none'"
      icon="i-lucide-calendar-clock"
      :title="`Il programma del ${data.year} non c’è ancora`"
      :description="`Questa sessione userà il programma del ${data.year}. Crealo nella pagina Programma: varrà per tutte le sessioni dell’anno.`"
      :actions="[{ label: 'Vai ai programmi', icon: 'i-lucide-calendar-clock', to: '/admin/programma' }]"
    />

    <template v-else-if="data.programme">
      <UAlert
        v-if="data.source === 'year'"
        color="neutral"
        variant="subtle"
        icon="i-lucide-calendar-clock"
        :title="`Questa sessione usa il programma del ${data.year}`"
        :description="
          data.editable
            ? `Le modifiche al programma del ${data.year} valgono per tutte le sessioni dell’anno senza una copia. Se questa sessione ha bisogno di qualcosa di diverso, crea una copia solo per lei.`
            : `Le modifiche al programma del ${data.year} valgono per tutte le sessioni dell’anno senza una copia.`
        "
        :actions="[
          {
            label: `Modifica il programma del ${data.year}`,
            to: `/admin/programma/${data.year}`,
            color: 'neutral',
            variant: 'outline',
            size: 'md',
          },
          ...(data.editable
            ? [{ label: 'Crea una copia per questa sessione', size: 'md' as const, loading: busy, onClick: makeCopy }]
            : []),
        ]"
        class="mb-8"
      />
      <UAlert
        v-else
        color="info"
        variant="subtle"
        icon="i-lucide-copy"
        title="Questa sessione ha un programma suo"
        :description="`È una copia del programma del ${data.year}: le modifiche fatte qui valgono solo per questa sessione.`"
        :actions="
          data.editable
            ? [
                {
                  label: `Torna al programma del ${data.year}`,
                  color: 'neutral',
                  variant: 'outline',
                  size: 'md',
                  loading: busy,
                  onClick: dropCopy,
                },
              ]
            : []
        "
        class="mb-8"
      />

      <ProgrammeEditor
        v-if="data.source === 'session' && data.editable"
        :programme="data.programme"
        :dates="data.dates"
        :save="save"
      />
      <ProgrammeWeek v-else :content="data.programme.content" :dates="data.dates" />
    </template>
  </template>
</template>
