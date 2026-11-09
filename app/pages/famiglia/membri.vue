<script setup lang="ts">
import { ageOn } from '#shared/schemas/families'
import type { FamilyMembersResponse, OwnFamilyMember } from '#shared/types/families'
import { enumLabel } from '#shared/utils/constants'
import { fullName, plural } from '#shared/utils/format'

// The members of the family. Health details (disability) only after the explicit consent, which the
// family gives or withdraws at the bottom of the page (docs/spec.md, 3.8).
const api = useApi()
const confirm = useConfirm()
const { data, refresh } = await useApiFetch<FamilyMembersResponse>('/api/family/members')

const members = computed(() => data.value?.members ?? [])
const consent = computed(() => Boolean(data.value?.healthDataConsentAt))
const withHealth = computed(() => members.value.filter(member => member.health?.hasDisability).length)
/** The cards come from the family data: until it is confirmed there is only the account holder's. */
const confirmed = computed(() => data.value?.formStatus === 'submitted')
const toComplete = computed(() => members.value.filter(member => !member.firstName))
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

/** The name, or "Adulto 2" while the card is empty: numbered among the cards of its kind. */
function title(member: OwnFamilyMember): string {
  const name = fullName(member)
  if (name) return name
  const sameKind = members.value.filter(other => other.kind === member.kind)
  return `${enumLabel('memberKind', member.kind)} ${sameKind.indexOf(member) + 1}`
}

function summary(member: OwnFamilyMember): string {
  if (!member.relationship) return 'Scheda da compilare: nome, parentela, data di nascita'
  const relationship = enumLabel('memberRelationship', member.relationship)
  if (!member.birthDate) return relationship
  const age = ageOn(member.birthDate)
  return `${relationship} · ${age === 1 ? '1 anno' : `${age} anni`}`
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
                v-if="!member.firstName"
                color="warning"
                variant="subtle"
                icon="i-lucide-file-pen-line"
                label="Da compilare"
              />
            </p>
            <p class="text-sm text-muted">{{ summary(member) }}</p>
            <p v-if="member.health?.hasDisability" class="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <UIcon name="i-lucide-lock" class="size-4 shrink-0" aria-hidden="true" />
              Patologia o disabilità indicata, dati sulla salute riservati
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              v-if="!member.firstName"
              icon="i-lucide-pencil"
              label="Compila"
              :color="member.id === nextCardId ? 'primary' : 'neutral'"
              :variant="member.id === nextCardId ? 'solid' : 'outline'"
              class="pointer-coarse:min-h-11"
              :aria-label="`Compila la scheda ${title(member)}`"
              @click="openForm(member)"
            />
            <UButton
              v-else
              icon="i-lucide-pencil"
              label="Modifica"
              color="neutral"
              variant="outline"
              class="pointer-coarse:min-h-11"
              :aria-label="`Modifica ${title(member)}`"
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

    <FamiliesMemberFormModal v-model:open="formOpen" :member="editing" :consent="consent" @saved="refresh" />
  </IcPage>
</template>
