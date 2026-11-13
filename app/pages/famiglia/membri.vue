<script setup lang="ts">
import type { FamilyMembersResponse, OwnFamilyMember, PersonalDocumentDto } from '#shared/types/families'
import { isCardToComplete, isEmptyCard, memberLine, memberName, plural } from '#shared/utils/format'

// The members of the family. Health details (disability) only after the explicit consent, which the
// family gives or withdraws at the bottom of the page (docs/spec.md, 3.8).
const api = useApi()
const confirm = useConfirm()
const { data, refresh } = await useApiFetch<FamilyMembersResponse>('/api/family/members')
const { data: documents, refresh: refreshDocuments } = await useApiFetch<PersonalDocumentDto[]>('/api/family/documents')

const members = computed(() => data.value?.members ?? [])
const consent = computed(() => Boolean(data.value?.healthDataConsentAt))
const withHealth = computed(() => members.value.filter(member => member.health?.hasDisability).length)
/** The cards come from the family data: until it is confirmed there is only the account holder's. */
const confirmed = computed(() => data.value?.formStatus === 'submitted')
const toComplete = computed(() => members.value.filter(isCardToComplete))
/** The first card to fill in carries the one primary button of the page. */
const nextCardId = computed(() => toComplete.value[0]?.id)

const description = computed(() => {
  const people = plural(members.value.length, 'persona', 'persone')
  return toComplete.value.length ? `${people}, ${toComplete.value.length} da compilare.` : `${people}.`
})

// The home links to #consenso: the page body scrolls inside the dashboard panel, not the window.
const route = useRoute()
onMounted(() => {
  if (route.hash === '#consenso') nextTick(() => document.getElementById('consenso')?.scrollIntoView())
})

const formOpen = ref(false)
const editing = ref<OwnFamilyMember | null>(null)

function openForm(member: OwnFamilyMember | null) {
  editing.value = member
  formOpen.value = true
}

/** Who the others' relationship refers to: the young people with a condition, by first name. */
const reference = computed(() =>
  new Intl.ListFormat('it', { type: 'conjunction' }).format(
    members.value.flatMap(member =>
      member.kind === 'young' && member.health?.hasDisability && member.firstName ? [member.firstName] : [],
    ),
  ),
)

/** Members with an identity document uploaded. */
const withIdDocument = computed(
  () =>
    new Set(
      (documents.value ?? []).flatMap(doc => (doc.category === 'id_document' && doc.member ? [doc.member.id] : [])),
    ),
)
const idMember = ref<OwnFamilyMember | null>(null)
const idOpen = computed({
  get: () => Boolean(idMember.value),
  set: value => {
    if (!value) idMember.value = null
  },
})

async function idUploaded() {
  idMember.value = null
  await refreshDocuments()
}

/** The name, or "Adulto 2" while the card is empty. */
const title = (member: OwnFamilyMember) => memberName(member, members.value)

function summary(member: OwnFamilyMember): string {
  return isEmptyCard(member) ? 'Scheda da compilare: nome, parentela, data di nascita' : memberLine(member)
}

async function remove(member: OwnFamilyMember) {
  const ok = await confirm({
    title: `Rimuovere ${title(member)}?`,
    description:
      'Verranno cancellati i suoi dati, compresi quelli sulla salute. I documenti caricati restano tra i documenti della famiglia.',
    confirmLabel: 'Rimuovi',
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/api/family/members/${member.id}`, { method: 'DELETE' })
    notifySuccess('Componente rimosso', title(member))
    await refresh()
  } catch (error) {
    notifyError(error, 'Componente non rimosso')
  }
}
</script>

<template>
  <IcPage title="Componenti" width="narrow">
    <template v-if="confirmed" #actions>
      <UButton
        icon="i-lucide-user-plus"
        aria-label="Aggiungi un componente"
        :color="nextCardId ? 'neutral' : 'primary'"
        :variant="nextCardId ? 'outline' : 'solid'"
        class="pointer-coarse:min-h-11"
        @click="openForm(null)"
      >
        <span class="sm:hidden">Aggiungi</span>
        <span class="hidden sm:inline">Aggiungi un componente</span>
      </UButton>
    </template>

    <UAlert
      v-if="data && !confirmed"
      class="mb-8"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="Prima conferma i dati della famiglia"
      description="Ci dici quante persone ne fanno parte e creiamo una scheda per ognuna: poi le completi qui."
      :actions="[
        { label: 'Vai ai dati della famiglia', to: '/famiglia/profilo', trailingIcon: 'i-lucide-arrow-right' },
      ]"
    />

    <IcSection title="La tua famiglia" :description="description">
      <ul v-if="members.length" class="divide-y divide-default rounded-lg border border-default bg-elevated">
        <li v-for="member in members" :key="member.id" class="flex flex-wrap items-center gap-3 p-4">
          <div class="min-w-0 flex-1 basis-56">
            <p class="flex flex-wrap items-center gap-2 font-semibold text-highlighted">
              {{ title(member) }}
              <UBadge
                v-if="member.isReferent"
                color="primary"
                variant="subtle"
                icon="i-lucide-star"
                label="Referente"
              />
              <UBadge
                v-if="isCardToComplete(member)"
                color="warning"
                variant="subtle"
                icon="i-lucide-file-pen-line"
                label="Da compilare"
              />
            </p>
            <p class="text-sm text-muted">{{ summary(member) }}</p>
            <p v-if="withIdDocument.has(member.id)" class="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <UIcon name="i-lucide-id-card" class="size-4 shrink-0" aria-hidden="true" />
              Documento di identità caricato
            </p>
            <p v-if="member.health?.hasDisability" class="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <UIcon name="i-lucide-lock" class="size-4 shrink-0" aria-hidden="true" />
              Patologia o disabilità indicata, dati sulla salute riservati
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="!isEmptyCard(member) && !withIdDocument.has(member.id)"
              icon="i-lucide-id-card"
              label="Carica il documento di identità"
              color="neutral"
              variant="outline"
              class="pointer-coarse:min-h-11"
              :aria-label="`Carica il documento di identità di ${title(member)}`"
              @click="idMember = member"
            />
            <UButton
              icon="i-lucide-pencil"
              :label="isCardToComplete(member) ? 'Compila' : 'Modifica'"
              :color="member.id === nextCardId ? 'primary' : 'neutral'"
              :variant="member.id === nextCardId ? 'solid' : 'outline'"
              class="pointer-coarse:min-h-11"
              :aria-label="`${isCardToComplete(member) ? 'Compila la scheda' : 'Modifica'} ${title(member)}`"
              @click="openForm(member)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              class="pointer-coarse:min-h-11 pointer-coarse:min-w-11 justify-center"
              :aria-label="`Rimuovi ${title(member)}`"
              @click="remove(member)"
            />
          </div>
        </li>
      </ul>
      <UEmpty
        v-else-if="confirmed"
        icon="i-lucide-users"
        title="Nessun componente"
        description="Aggiungi le persone della tua famiglia, a partire da te."
        :actions="[{ label: 'Aggiungi un componente', icon: 'i-lucide-user-plus', onClick: () => openForm(null) }]"
      />
    </IcSection>

    <IcSection
      id="consenso"
      title="Dati sulla salute"
      description="Il consenso per indicare disabilità e bisogni di supporto."
    >
      <FamiliesHealthConsent
        :consent-at="data?.healthDataConsentAt ?? null"
        :members-with-health="withHealth"
        :health-documents="data?.healthDocuments ?? 0"
        @changed="refresh"
      />
    </IcSection>

    <FamiliesMemberFormModal
      v-model:open="formOpen"
      :member="editing"
      :consent="consent"
      :reference="reference"
      @saved="refresh"
    />
    <UModal
      v-model:open="idOpen"
      :title="`Documento di identità di ${idMember ? title(idMember) : ''}`"
      description="Lo vedete solo voi e l’amministrazione del camp. Lo ritrovi nella pagina Documenti."
    >
      <template #body>
        <FamiliesDocumentUploadForm
          v-if="idMember"
          :members="members"
          :health-consent="consent"
          :preset="{ category: 'id_document', member: idMember.id }"
          @uploaded="idUploaded"
        />
      </template>
    </UModal>
  </IcPage>
</template>
