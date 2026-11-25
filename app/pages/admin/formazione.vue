<script setup lang="ts">
import { trainingOptionSchema } from '#shared/schemas/staff'
import type { TrainingOptionDto } from '#shared/types/staff'
import { plural } from '#shared/utils/format'
import { teamPath } from '#shared/utils/routes'
import { focusFirstError } from '~/utils/errors'

// «Formazione» (spec 3.4): the trainings the administration proposes, which staff and v-team tick to say they are
// interested; for each one who is.
const api = useApi()
const confirm = useConfirm()
const { label } = useEnums()
const { data, error, refresh } = await useApiFetch<TrainingOptionDto[]>('/api/admin/training')
const options = computed(() => data.value ?? [])

const editing = ref<TrainingOptionDto | null>(null)
const open = ref(false)
const state = reactive({ title: '', description: '' })
function edit(option: TrainingOptionDto | null) {
  editing.value = option
  state.title = option?.title ?? ''
  state.description = option?.description ?? ''
  open.value = true
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const id = editing.value?.id
    const url: string = id ? `/api/admin/training/${id}` : '/api/admin/training'
    await api(url, { method: id ? 'PUT' : 'POST', body: state })
    notifySuccess(id ? 'Proposta aggiornata' : 'Proposta aggiunta')
    open.value = false
    await refresh()
  } catch (error) {
    notifyError(error, 'Proposta non salvata')
  } finally {
    saving.value = false
  }
}

async function remove(option: TrainingOptionDto) {
  const people = option.people.length
  const ok = await confirm({
    title: `Elimini «${option.title}»?`,
    description: people
      ? people === 1
        ? '1 persona l’ha spuntata: perdi anche il suo interesse.'
        : `${people} persone l’hanno spuntata: perdi anche il loro interesse.`
      : 'Nessuno l’ha ancora spuntata.',
    confirmLabel: 'Elimina',
    danger: true,
  })
  if (!ok) return
  try {
    const url: string = `/api/admin/training/${option.id}`
    await api(url, { method: 'DELETE' })
    notifySuccess('Proposta eliminata')
    await refresh()
  } catch (error) {
    notifyError(error)
  }
}
</script>

<template>
  <IcPage title="Formazione">
    <template #actions>
      <UButton label="Aggiungi una proposta" icon="i-lucide-plus" class="pointer-coarse:min-h-11" @click="edit(null)" />
    </template>

    <IcSection
      title="Le proposte"
      description="Le formazioni che proponi: staff e v-team spuntano quelle che li interessano, dalla loro pagina «Formazione»."
    >
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="Non riesco a caricare le proposte"
        description="Ricarica la pagina tra poco."
      />
      <UEmpty
        v-else-if="!options.length"
        icon="i-lucide-graduation-cap"
        title="Nessuna proposta"
        description="Aggiungi le formazioni che il camp potrebbe organizzare: le persone dello staff ti dicono quali le interessano."
        variant="naked"
      />
      <ul v-else class="divide-y divide-default rounded-lg border border-default bg-elevated">
        <li v-for="option in options" :key="option.id" class="space-y-2 p-4">
          <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div class="min-w-0">
              <p class="font-semibold text-highlighted">{{ option.title }}</p>
              <p v-if="option.description" class="max-w-prose text-sm whitespace-pre-line text-muted">
                {{ option.description }}
              </p>
            </div>
            <div class="flex shrink-0 gap-1">
              <UButton
                icon="i-lucide-pencil"
                label="Modifica"
                color="neutral"
                variant="ghost"
                class="pointer-coarse:min-h-11"
                @click="edit(option)"
              />
              <UButton
                icon="i-lucide-trash-2"
                label="Elimina"
                color="neutral"
                variant="ghost"
                class="pointer-coarse:min-h-11"
                @click="remove(option)"
              />
            </div>
          </div>
          <p v-if="!option.people.length" class="text-sm text-muted">Ancora nessun interessato.</p>
          <details v-else>
            <summary class="cursor-pointer text-sm font-semibold">
              {{ plural(option.people.length, 'persona interessata', 'persone interessate') }}
            </summary>
            <ul class="mt-2 space-y-1">
              <li v-for="person in option.people" :key="person.userId" class="text-sm">
                <ULink :to="teamPath(person.team, person.userId)" class="text-primary hover:underline">
                  {{ person.name }}
                </ULink>
                <span class="text-muted"> · {{ label('staffTeam', person.team) }}</span>
              </li>
            </ul>
          </details>
        </li>
      </ul>
    </IcSection>

    <UModal v-model:open="open" :title="editing ? 'Modifica la proposta' : 'Nuova proposta di formazione'">
      <template #body>
        <UForm
          id="training-form"
          :schema="trainingOptionSchema"
          :state="state"
          class="space-y-5"
          @submit="save"
          @error="focusFirstError"
        >
          <UFormField label="Titolo" name="title" required help="Per esempio: Primo soccorso pediatrico (BLSD).">
            <UInput v-model="state.title" :maxlength="120" class="w-full" />
          </UFormField>
          <UFormField label="Descrizione" name="description" hint="Facoltativa">
            <UTextarea v-model="state.description" :maxlength="500" :rows="3" autoresize class="w-full" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Annulla" color="neutral" variant="ghost" @click="open = false" />
          <UButton type="submit" form="training-form" label="Salva" :loading="saving" />
        </div>
      </template>
    </UModal>
  </IcPage>
</template>
