<script setup lang="ts">
import { usefulInfoItems } from '#shared/content/member-form'
import { normalizeUsefulInfo, usefulInfoForm } from '#shared/schemas/families'
import { staffUsefulInfoSchema } from '#shared/schemas/staff'
import type { StaffUsefulInfoDto } from '#shared/types/staff'

// The canteen details of the signed-in staff member (docs/spec.md 3.14): allergies, diet, notes, with the
// consent to health data. They reach the canteen summary of the sessions they are convoked to.
const api = useApi()
const confirm = useConfirm()
const { data, refresh } = await useApiFetch<StaffUsefulInfoDto>('/api/staff/useful-info')

const items = computed(() => (data.value?.info ? usefulInfoItems(data.value.info) : null))

const open = ref(false)
const saving = ref(false)
const state = reactive({ info: usefulInfoForm(null), consent: false })

function edit() {
  state.info = usefulInfoForm(data.value?.info)
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
    <IcDataList v-if="items" :items="items" class="min-w-0 flex-1" />
    <p v-else class="max-w-prose text-muted">Non hai indicato allergie, intolleranze o preferenze alimentari.</p>
    <UButton
      class="pointer-coarse:min-h-11"
      :label="items ? 'Modifica' : 'Indica allergie e preferenze'"
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
