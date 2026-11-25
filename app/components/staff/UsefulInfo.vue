<script setup lang="ts">
import { HEALTH_LABELS, staffHealthItems } from '#shared/content/member-form'
import { usefulInfoForm } from '#shared/schemas/families'
import { hasStaffHealth, staffUsefulInfoSchema } from '#shared/schemas/staff'
import type { StaffUsefulInfoDto } from '#shared/types/staff'

// The health data of the signed-in staff member, with the consent: allergies, diet and notes reach the canteen
// summary of the sessions they are convoked to (docs/spec.md 3.14); the other details only the administration.
// On the personal sheet (/staff/scheda), which loads them with the sheet.
const data = defineModel<StaffUsefulInfoDto>({ required: true })
const api = useApi()
const confirm = useConfirm()

const items = computed(() => (hasStaffHealth(data.value) ? staffHealthItems(data.value) : null))

const open = ref(false)
const saving = ref(false)
const state = reactive({ info: usefulInfoForm(null), otherInfo: '', consent: false })

function edit() {
  state.info = usefulInfoForm(data.value.info)
  state.otherInfo = data.value.otherInfo ?? ''
  // Never ticked in advance: each save is the consent to what is saved then.
  state.consent = false
  open.value = true
}

/** Saves the form, or with `clear` deletes the details and withdraws the consent, after asking. */
async function save(clear = false) {
  const body = clear ? { info: {}, otherInfo: '', consent: false } : state
  if (items.value && !hasStaffHealth(body)) {
    const ok = await confirm({
      title: 'Cancellare questi dati?',
      description: 'Allergie, preferenze e le altre informazioni vengono cancellate e il consenso viene ritirato.',
      confirmLabel: 'Cancella',
      danger: true,
    })
    if (!ok) return
  }
  saving.value = true
  try {
    data.value = await api<StaffUsefulInfoDto>('/api/staff/useful-info', { method: 'PUT', body })
    notifySuccess(hasStaffHealth(data.value) ? 'Dati salvati' : 'Dati cancellati')
    open.value = false
  } catch (error) {
    notifyError(error, 'Dati non salvati')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <IcDataList v-if="items" :items="items" class="min-w-0 flex-1" />
    <p v-else class="max-w-prose text-muted">Non hai indicato allergie, intolleranze, preferenze o altro.</p>
    <UButton
      class="pointer-coarse:min-h-11"
      :label="items ? 'Modifica' : 'Indica allergie e altro'"
      icon="i-lucide-utensils"
      color="neutral"
      variant="outline"
      @click="edit"
    />

    <UModal
      v-model:open="open"
      title="Alimentazione e altre informazioni"
      description="Allergie e preferenze arrivano al fornitore dei pasti delle sessioni a cui partecipi, con il tuo nome. Il resto lo legge solo l’amministrazione."
    >
      <template #body>
        <UForm :schema="staffUsefulInfoSchema" :state="state" class="space-y-5" @submit="save()">
          <IcUsefulInfoFields v-model="state.info" name="info" />
          <UFormField
            :label="HEALTH_LABELS.staffOther"
            name="otherInfo"
            hint="Facoltativo"
            help="Quello che ci aiuta a rendere la tua esperienza al camp più accogliente, per esempio discalculia, disgrafia, daltonismo."
          >
            <UTextarea v-model="state.otherInfo" autoresize :rows="4" class="w-full" />
          </UFormField>
          <UFormField name="consent">
            <UCheckbox
              v-model="state.consent"
              label="Acconsento al trattamento di questi dati per organizzare il camp"
              description="Allergie, intolleranze e le altre informazioni possono essere dati sulla salute: li usiamo solo per organizzare i pasti e la tua partecipazione al camp."
            />
          </UFormField>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              v-if="items"
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
