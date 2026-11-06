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

function summary(member: OwnFamilyMember): string {
  const relationship = enumLabel('memberRelationship', member.relationship)
  if (!member.birthDate) return relationship
  const age = ageOn(member.birthDate)
  return `${relationship} · ${age === 1 ? '1 anno' : `${age} anni`}`
}

async function remove(member: OwnFamilyMember) {
  const ok = await confirm({
    title: `Rimuovere ${fullName(member)}?`,
    description:
      'Verranno cancellati i suoi dati, compresi quelli sulla salute. I documenti caricati restano tra i documenti della famiglia.',
    confirmLabel: 'Rimuovi',
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/api/family/members/${member.id}`, { method: 'DELETE' })
    notifySuccess('Componente rimosso', fullName(member))
    await refresh()
  } catch (error) {
    notifyError(error, 'Componente non rimosso')
  }
}
</script>

<template>
  <IcPage title="Componenti" width="narrow">
    <template #actions>
      <UButton
        icon="i-lucide-user-plus"
        aria-label="Aggiungi un componente"
        class="pointer-coarse:min-h-11"
        @click="openForm(null)"
      >
        <span class="sm:hidden">Aggiungi</span>
        <span class="hidden sm:inline">Aggiungi un componente</span>
      </UButton>
    </template>

    <IcSection
      title="La tua famiglia"
      :description="`${plural(members.length, 'persona', 'persone')}. Indica tutte quelle che verranno al camp.`"
    >
      <ul v-if="members.length" class="divide-y divide-default rounded-lg border border-default bg-elevated">
        <li v-for="member in members" :key="member.id" class="flex flex-wrap items-center gap-3 p-4">
          <div class="min-w-0 flex-1 basis-56">
            <p class="flex flex-wrap items-center gap-2 font-semibold text-highlighted">
              {{ fullName(member) }}
              <UBadge
                v-if="member.isReferent"
                color="primary"
                variant="subtle"
                icon="i-lucide-star"
                label="Referente"
              />
            </p>
            <p class="text-sm text-muted">{{ summary(member) }}</p>
            <p v-if="member.health?.hasDisability" class="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <UIcon name="i-lucide-lock" class="size-4 shrink-0" aria-hidden="true" />
              Persona con disabilità, dati sulla salute inseriti
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              icon="i-lucide-pencil"
              label="Modifica"
              color="neutral"
              variant="outline"
              class="pointer-coarse:min-h-11"
              :aria-label="`Modifica ${fullName(member)}`"
              @click="openForm(member)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              class="pointer-coarse:min-h-11 pointer-coarse:min-w-11 justify-center"
              :aria-label="`Rimuovi ${fullName(member)}`"
              @click="remove(member)"
            />
          </div>
        </li>
      </ul>
      <UEmpty
        v-else
        icon="i-lucide-users"
        title="Nessun componente"
        description="Aggiungi le persone della tua famiglia che verranno al camp, a partire da te."
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
        @changed="refresh"
      />
    </IcSection>

    <FamiliesMemberFormModal v-model:open="formOpen" :member="editing" :consent="consent" @saved="refresh" />
  </IcPage>
</template>
