<script setup lang="ts">
import { adminNotesSchema } from '#shared/schemas/families'
import { ageOn } from '#shared/utils/dates'
import type { AdminFamilyDetail, FamilyMemberDto } from '#shared/types/families'
import { enumLabel } from '#shared/utils/constants'
import { formatAge, formatDay, formatDateTime, fullName, isEmptyCard, memberName, plural } from '#shared/utils/format'

// The record of one family for the administration: data and contacts, members (health details only
// in the reserved section, loaded on demand), sessions (A1), questionnaire, personal documents,
// signatures (A4), internal notes; "Aggiungi a una sessione" (A1's endpoint) and "Scrivi alla
// famiglia" (A5's composer).
const route = useRoute()
const familyId = computed(() => String(route.params.id))
const api = useApi()
const {
  data: family,
  error,
  refresh,
} = await useApiFetch<AdminFamilyDetail>(() => `/api/admin/families/${familyId.value}`)

const contacts = computed(() => {
  const f = family.value
  if (!f) return []
  return [
    { label: 'Referente', value: fullName(f.referent) },
    { label: 'Email', value: f.referent.email },
    { label: 'Telefono', value: f.phone ?? f.referent.phone },
    { label: 'Indirizzo', value: f.address },
    {
      label: 'Città',
      value: [f.postalCode, f.city, f.province ? `(${f.province})` : null].filter(Boolean).join(' '),
    },
    { label: 'Regione', value: f.region },
    { label: 'Registrata il', value: formatDateTime(f.createdAt) },
    { label: 'Ultimo accesso', value: f.referent.lastLoginAt ? formatDateTime(f.referent.lastLoginAt) : 'Mai' },
    {
      label: 'Informativa privacy',
      value: f.privacyConsentAt ? `Accettata il ${formatDateTime(f.privacyConsentAt)}` : 'Non accettata',
    },
  ]
})

function memberSummary(member: FamilyMemberDto): string {
  if (isEmptyCard(member) || !member.relationship) return 'Scheda non ancora compilata dalla famiglia'
  const relationship = enumLabel('memberRelationship', member.relationship)
  if (!member.birthDate) return member.kind === 'adult' ? `${relationship} · manca la data di nascita` : relationship
  const age = ageOn(member.birthDate)
  return `${relationship} · ${formatAge(age)} (${formatDay(member.birthDate)})`
}

const writeTo = computed(() =>
  family.value ? `/admin/comunicazioni/nuova?userIds=${family.value.referent.userId}` : '/admin/comunicazioni/nuova',
)

// ─── Aggiungi a una sessione ───
const addOpen = ref(false)
const historyKey = ref(0)
async function onAdded() {
  historyKey.value++
  await refresh()
}

// ─── Dati della famiglia, modificati per suo conto ───
const editOpen = ref(false)
async function onDataSaved() {
  editOpen.value = false
  await refresh()
}

// ─── Note interne ───
const notes = reactive({ adminNotes: '' })
watch(
  () => family.value?.adminNotes,
  value => {
    notes.adminNotes = value ?? ''
  },
  { immediate: true },
)
const notesChanged = computed(() => notes.adminNotes.trim() !== (family.value?.adminNotes ?? ''))
const savingNotes = ref(false)

async function saveNotes() {
  if (!family.value) return
  savingNotes.value = true
  try {
    const result = await api<{ adminNotes: string | null }>(`/api/admin/families/${family.value.id}/notes`, {
      method: 'PUT',
      body: notes,
    })
    family.value.adminNotes = result.adminNotes
    notifySuccess('Note salvate')
  } catch (error) {
    notifyError(error, 'Note non salvate')
  } finally {
    savingNotes.value = false
  }
}
</script>

<template>
  <IcPage :title="family?.name ?? 'Famiglia'" back="/admin/famiglie">
    <template v-if="family" #actions>
      <UButton :to="writeTo" icon="i-lucide-mail" color="neutral" variant="outline" aria-label="Scrivi alla famiglia">
        <span class="hidden md:inline">Scrivi alla famiglia</span>
      </UButton>
      <UButton icon="i-lucide-calendar-plus" aria-label="Aggiungi a una sessione" @click="addOpen = true">
        <span class="hidden md:inline">Aggiungi a una sessione</span>
      </UButton>
    </template>

    <UEmpty
      v-if="error || !family"
      icon="i-lucide-search-x"
      title="Famiglia non trovata"
      description="Il link potrebbe essere sbagliato, oppure la famiglia non esiste più."
      :actions="[{ label: 'Torna alle famiglie', icon: 'i-lucide-arrow-left', to: '/admin/famiglie' }]"
    />

    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <IcStatusBadge kind="familyFormStatus" :value="family.formStatus" />
        <IcStatusBadge v-if="family.referent.status !== 'active'" kind="userStatus" :value="family.referent.status" />
        <span class="text-sm text-muted">{{ plural(family.members.length, 'componente', 'componenti') }}</span>
      </div>

      <IcSection title="Dati e contatti">
        <template #actions>
          <UButton
            label="Modifica i dati"
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            @click="editOpen = true"
          />
        </template>
        <IcDataList :items="contacts" :columns="3" />
      </IcSection>

      <IcSection
        title="Componenti"
        description="Senza dati sulla salute: quelli sono nella sezione riservata qui sotto."
      >
        <ul v-if="family.members.length" class="divide-y divide-default rounded-lg border border-default bg-elevated">
          <li
            v-for="member in family.members"
            :key="member.id"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
          >
            <span class="font-semibold text-highlighted">{{ memberName(member, family.members) }}</span>
            <UBadge v-if="member.isReferent" color="primary" variant="subtle" icon="i-lucide-star" label="Referente" />
            <span class="basis-full text-sm text-muted sm:basis-auto">{{ memberSummary(member) }}</span>
          </li>
        </ul>
        <p v-else class="text-muted">La famiglia non ha ancora indicato i componenti.</p>
      </IcSection>

      <IcSection
        title="Dati sulla salute"
        description="Dati particolari (art. 9 GDPR): solo qui, mai in liste, email o note."
      >
        <template #actions>
          <UBadge color="neutral" variant="outline" icon="i-lucide-lock" label="Riservato" />
        </template>
        <FamiliesReservedHealth :family-id="family.id" :consent-at="family.healthDataConsentAt" />
      </IcSection>

      <IcSection title="Sessioni">
        <SessionsFamilyHistory :key="historyKey" :family-id="family.id" />
      </IcSection>

      <IcSection
        title="Le risposte della famiglia"
        :description="
          family.formSubmittedAt
            ? `Dati confermati il ${formatDateTime(family.formSubmittedAt)}.`
            : 'La famiglia non ha ancora confermato i suoi dati.'
        "
      >
        <template #actions>
          <IcStatusBadge kind="familyFormStatus" :value="family.formStatus" />
        </template>
        <FamiliesQuestionnaireAnswers :answers="family.formAnswers" />
      </IcSection>

      <IcSection title="Documenti personali" description="Caricati dalla famiglia: certificati, diagnosi, documenti.">
        <FamiliesDocumentsList v-if="family.documents.length" :documents="family.documents" />
        <p v-else class="text-muted">La famiglia non ha ancora caricato documenti.</p>
      </IcSection>

      <IcSection title="Documenti da firmare">
        <DocumentsUserSignatures :user-id="family.referent.userId" />
      </IcSection>

      <IcSection title="Note interne" description="Visibili solo all’amministrazione, mai alla famiglia.">
        <UForm :schema="adminNotesSchema" :state="notes" class="max-w-prose space-y-4" @submit="saveNotes">
          <UFormField label="Note" name="adminNotes" hint="Facoltativo">
            <UTextarea v-model="notes.adminNotes" autoresize :rows="4" class="w-full" />
          </UFormField>
          <UButton
            type="submit"
            color="neutral"
            variant="outline"
            label="Salva le note"
            :disabled="!notesChanged"
            :loading="savingNotes"
          />
        </UForm>
      </IcSection>

      <UModal
        v-model:open="editOpen"
        title="Modifica i dati della famiglia"
        description="Per conto della famiglia: la modifica viene registrata. Email e nome del referente sono dell’account (Utenti)."
      >
        <template #body>
          <FamiliesFamilyDataForm :family="family" @saved="onDataSaved">
            <template #cancel>
              <UButton label="Annulla" color="neutral" variant="outline" @click="editOpen = false" />
            </template>
          </FamiliesFamilyDataForm>
        </template>
      </UModal>

      <FamiliesAddToSessionModal
        v-model:open="addOpen"
        :family-id="family.id"
        :family-name="family.name"
        :active-session-ids="family.activeSessionIds"
        @added="onAdded"
      />
    </template>
  </IcPage>
</template>
