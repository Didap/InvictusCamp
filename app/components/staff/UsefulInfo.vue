<script setup lang="ts">
import { ALLERGIES, DIETS, choiceLabel } from '#shared/content/member-form'
import { normalizeUsefulInfo } from '#shared/schemas/families'
import { staffUsefulInfoSchema } from '#shared/schemas/staff'
import type { StaffUsefulInfoDto } from '#shared/types/staff'
import { andList } from '#shared/utils/format'

// The canteen details of the signed-in staff member (docs/spec.md 3.14): allergies, diet, notes, with the
// consent to health data. They reach the canteen summary of the sessions they are convoked to.
const api = useApi()
const confirm = useConfirm()
const { data, refresh } = await useApiFetch<StaffUsefulInfoDto>('/api/staff/useful-info')

const summary = computed(() => {
  const info = data.value?.info
  if (!info) return null
  return [
    info.allergies?.length && `Allergie e intolleranze: ${andList(info.allergies.map(a => choiceLabel(ALLERGIES, a)))}`,
    info.diet && `Preferenza: ${choiceLabel(DIETS, info.diet).toLowerCase()}`,
    info.notes,
  ].filter(Boolean)
})

const open = ref(false)
const saving = ref(false)
const state = reactive({ info: { allergies: [] as string[], diet: '', notes: '' }, consent: false })

function edit() {
  const info = data.value?.info
  state.info = { allergies: [...(info?.allergies ?? [])], diet: info?.diet ?? '', notes: info?.notes ?? '' }
  state.consent = Boolean(data.value?.consentAt)
  open.value = true
}

/** Saves the form, or with `clear` deletes the details and withdraws the consent, after asking. */
async function save(clear = false) {
  const body = clear ? { info: {}, consent: false } : state
  if (data.value?.info && !normalizeUsefulInfo(body.info)) {
    const ok = await confirm({
      title: 'Cancellare i dati per la mensa?',
      description: 'Allergie, preferenze e note vengono cancellate e il consenso viene ritirato.',
      confirmLabel: 'Cancella',
      danger: true,
    })
    if (!ok) return
  }
  saving.value = true
  try {
    data.value = await api<StaffUsefulInfoDto>('/api/staff/useful-info', { method: 'PUT', body })
    notifySuccess(data.value.info ? 'Dati per la mensa salvati' : 'Dati per la mensa cancellati')
    open.value = false
  } catch (error) {
    notifyError(error, 'Dati non salvati')
    await refresh()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="max-w-prose space-y-1">
      <template v-if="summary">
        <p v-for="line in summary" :key="line">{{ line }}</p>
      </template>
      <p v-else class="text-muted">Non hai indicato allergie, intolleranze o preferenze alimentari.</p>
    </div>
    <UButton
      class="pointer-coarse:min-h-11"
      :label="summary ? 'Modifica' : 'Indica allergie e preferenze'"
      icon="i-lucide-utensils"
      color="neutral"
      variant="outline"
      @click="edit"
    />

    <UModal
      v-model:open="open"
      title="Per la mensa"
      description="Arrivano al fornitore dei pasti delle sessioni a cui partecipi, con il tuo nome."
    >
      <template #body>
        <UForm :schema="staffUsefulInfoSchema" :state="state" class="space-y-5" @submit="save()">
          <IcUsefulInfoFields v-model="state.info" name="info" />
          <UFormField name="consent">
            <UCheckbox
              v-model="state.consent"
              label="Acconsento al trattamento di questi dati per organizzare i pasti"
              description="Allergie e intolleranze sono dati sulla salute: li usiamo solo per organizzare i pasti del camp."
            />
          </UFormField>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              v-if="data?.info"
              label="Cancella i dati e ritira il consenso"
              color="error"
              variant="ghost"
              class="me-auto pointer-coarse:min-h-11"
              @click="save(true)"
            />
            <UButton
              label="Annulla"
              color="neutral"
              variant="outline"
              class="pointer-coarse:min-h-11"
              @click="open = false"
            />
            <UButton type="submit" label="Salva" :loading="saving" class="pointer-coarse:min-h-11" />
          </div>
        </UForm>
      </template>
    </UModal>
  </div>
</template>
