<script setup lang="ts">
import { staffApplicationSchema } from '#shared/schemas/staff'
import type { FileDto } from '#shared/types/api'
import type { StaffApplicationDto } from '#shared/types/staff'
import type { StaffRole } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDay } from '#shared/utils/format'

// The application (spec 3.4): birth date, city, roles, qualifications, experience, motivation and the
// CV as PDF. Saved as a draft while the account is `registered`; sending it makes it `applied` and
// read-only. The review notes of the administration never reach this page.
const api = useApi()
const confirm = useConfirm()
const { label, meta, options } = useEnums()
const { data: application, refresh } = await useApiFetch<StaffApplicationDto>('/api/staff/application')

const today = todayIso()
const state = reactive({
  birthDate: '',
  city: '',
  roles: [] as StaffRole[],
  qualifications: '',
  experience: '',
  motivation: '',
})
const cv = ref<FileDto | null>(null)
// The form is filled once from the server, so a refresh never overwrites what the person is typing.
const filled = ref(false)
watch(
  application,
  value => {
    if (!value || filled.value) return
    Object.assign(state, {
      birthDate: value.birthDate ?? '',
      city: value.city ?? '',
      roles: [...value.roles],
      qualifications: value.qualifications ?? '',
      experience: value.experience ?? '',
      motivation: value.motivation ?? '',
    })
    cv.value = value.cv
    filled.value = true
  },
  { immediate: true },
)

const roleItems = computed(() =>
  options('staffRole').map(option => ({ label: option.label, value: option.value as StaffRole })),
)

const dayOf = (instant: string | null) => (instant ? formatDay(todayIso(new Date(instant)), 'long') : '')

function draftBody() {
  return {
    birthDate: state.birthDate || null,
    city: state.city.trim() || null,
    roles: state.roles,
    qualifications: state.qualifications.trim() || null,
    experience: state.experience.trim() || null,
    motivation: state.motivation.trim() || null,
  }
}

const saving = ref(false)
async function saveDraft() {
  saving.value = true
  try {
    await api('/api/staff/application', { method: 'PUT', body: draftBody() })
    notifySuccess('Bozza salvata', 'Puoi riprendere quando vuoi.')
  } catch (error) {
    notifyError(error, 'Bozza non salvata')
  } finally {
    saving.value = false
  }
}

function cvUploaded(result: unknown) {
  cv.value = result as FileDto
}

const sending = ref(false)
async function submit() {
  if (!cv.value) {
    notifyError({ data: { message: 'Carica il tuo CV in PDF prima di inviare la candidatura.' } }, 'Manca il CV')
    return
  }
  const ok = await confirm({
    title: 'Invii la candidatura?',
    description:
      'Dopo l’invio non potrai più modificarla. L’amministrazione la valuta e ti scrive per email quando c’è un esito.',
    confirmLabel: 'Invia la candidatura',
  })
  if (!ok) return
  sending.value = true
  try {
    await api('/api/staff/application/submit', { method: 'POST', body: state })
    notifySuccess('Candidatura inviata', 'Ti scriveremo per email quando c’è un esito.')
    await refresh()
    await nextTick()
    window.scrollTo({ top: 0 })
  } catch (error) {
    notifyError(error, 'Candidatura non inviata')
  } finally {
    sending.value = false
  }
}

const SENT_TITLE: Record<string, string> = {
  applied: 'Candidatura inviata',
  approved: 'Candidatura approvata',
  rejected: 'Candidatura non selezionata',
  inactive: 'Candidatura approvata',
}
const details = computed(() => {
  const a = application.value
  if (!a) return []
  return [
    { label: 'Data di nascita', value: formatDay(a.birthDate, 'long') },
    { label: 'Città', value: a.city },
  ]
})
const texts = computed(() => {
  const a = application.value
  if (!a) return []
  return [
    { label: 'Titoli e qualifiche', value: a.qualifications },
    { label: 'Esperienze', value: a.experience },
    { label: 'Motivazione', value: a.motivation },
  ]
})
</script>

<template>
  <IcPage title="Candidatura" width="narrow">
    <template v-if="application">
      <!-- Sent: read only. -->
      <template v-if="!application.editable">
        <UAlert
          :color="application.status === 'rejected' ? 'neutral' : 'info'"
          variant="subtle"
          :icon="meta('staffStatus', application.status).icon"
          :title="SENT_TITLE[application.status] ?? 'Candidatura inviata'"
        >
          <template #description>
            Inviata il {{ dayOf(application.appliedAt) }}. Non si può più modificare:
            <IcContactLine as="span" lead="se devi correggere qualcosa" />
          </template>
        </UAlert>
        <IcSection title="Su di te">
          <IcDataList :items="details" :columns="2" />
        </IcSection>
        <IcSection title="Ruoli">
          <ul class="flex flex-wrap gap-2">
            <li v-for="role in application.roles" :key="role">
              <UBadge
                :icon="meta('staffRole', role).icon"
                :label="label('staffRole', role)"
                color="neutral"
                variant="outline"
                size="lg"
              />
            </li>
          </ul>
        </IcSection>
        <IcSection title="Esperienza">
          <dl class="space-y-5">
            <div v-for="item in texts" :key="item.label">
              <dt class="text-sm font-semibold text-muted">{{ item.label }}</dt>
              <dd class="mt-1 max-w-prose whitespace-pre-line" :class="item.value ? '' : 'text-dimmed'">
                {{ item.value || 'Non indicato' }}
              </dd>
            </div>
          </dl>
        </IcSection>
        <IcSection title="Curriculum">
          <IcFileLink v-if="application.cv" :file="application.cv" />
          <p v-else class="text-dimmed">Non caricato</p>
        </IcSection>
      </template>

      <!-- Registered: the form. -->
      <UForm v-else :schema="staffApplicationSchema" :state="state" @submit="submit">
        <p class="max-w-prose text-muted">
          Raccontaci chi sei e cosa sai fare: ci aiuta a capire in quale ruolo puoi dare il meglio al camp. Tutti i
          campi servono per l’invio, ma puoi salvare la bozza e riprendere quando vuoi.
        </p>

        <IcSection title="Su di te">
          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Data di nascita" name="birthDate" required>
              <UInput v-model="state.birthDate" type="date" :max="today" autocomplete="bday" class="w-full" />
            </UFormField>
            <UFormField label="Città in cui vivi" name="city" required>
              <UInput v-model="state.city" autocomplete="address-level2" :maxlength="100" class="w-full" />
            </UFormField>
          </div>
        </IcSection>

        <IcSection title="Ruoli" description="In quali ruoli puoi lavorare al camp? Puoi sceglierne più di uno.">
          <UFormField name="roles">
            <UCheckboxGroup
              v-model="state.roles"
              :items="roleItems"
              legend="Ruoli che puoi ricoprire (obbligatorio)"
              variant="card"
              :ui="{ legend: 'sr-only', fieldset: 'grid gap-2 sm:grid-cols-2' }"
            />
          </UFormField>
        </IcSection>

        <IcSection title="Esperienza">
          <div class="space-y-5">
            <UFormField
              label="Titoli e qualifiche"
              name="qualifications"
              help="Lauree, diplomi, attestati e corsi, per esempio il BLSD."
              required
            >
              <UTextarea v-model="state.qualifications" :rows="3" autoresize :maxlength="2000" class="w-full" />
            </UFormField>
            <UFormField
              label="Esperienze"
              name="experience"
              help="Lavori, tirocini o volontariato con bambini, ragazzi o persone con disabilità."
              required
            >
              <UTextarea v-model="state.experience" :rows="4" autoresize :maxlength="4000" class="w-full" />
            </UFormField>
            <UFormField
              label="Motivazione"
              name="motivation"
              help="Perché vuoi far parte dello staff di Invictus Camp?"
              required
            >
              <UTextarea v-model="state.motivation" :rows="4" autoresize :maxlength="2000" class="w-full" />
            </UFormField>
          </div>
        </IcSection>

        <IcSection
          title="Curriculum"
          description="Il tuo CV in PDF, fino a 15 MB. Se ne carichi uno nuovo, sostituisce il precedente."
        >
          <div class="space-y-4">
            <div v-if="cv" class="flex flex-wrap items-center gap-2">
              <span class="text-sm font-semibold text-muted">CV caricato:</span>
              <IcFileLink :file="cv" />
            </div>
            <IcFileUpload
              endpoint="/api/staff/application/cv"
              accept="application/pdf"
              label="Trascina qui il CV o sceglilo dal dispositivo"
              touch-label="Scegli il CV dal dispositivo"
              description="Solo PDF, fino a 15 MB"
              :button-label="cv ? 'Sostituisci il CV' : 'Carica il CV'"
              @uploaded="cvUploaded"
            />
          </div>
        </IcSection>

        <div class="flex flex-col-reverse gap-3 pt-8 sm:flex-row sm:justify-end">
          <UButton
            label="Salva la bozza"
            icon="i-lucide-save"
            color="neutral"
            variant="outline"
            size="lg"
            :loading="saving"
            class="pointer-coarse:min-h-11 justify-center"
            @click="saveDraft"
          />
          <UButton
            type="submit"
            label="Invia la candidatura"
            icon="i-lucide-send"
            size="lg"
            :loading="sending"
            class="pointer-coarse:min-h-11 justify-center"
          />
        </div>
      </UForm>
    </template>
  </IcPage>
</template>
