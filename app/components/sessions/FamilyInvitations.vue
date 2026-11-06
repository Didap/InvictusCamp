<script setup lang="ts">
import type { FamilySessionItem } from '#shared/types/sessions'

// CONTRACT (docs/BUILD.md): owned by A1 Sessioni. Family home: the invitations waiting for an answer
// (confirm or decline). No props: it reads the signed-in family. Renders nothing when there are none.
// It shares the data of /famiglia/sessioni (key "family-sessions"), so both update after an answer.
const emit = defineEmits<{ answered: [] }>()

const { data } = await useApiFetch<FamilySessionItem[]>('/api/family/sessions', { key: 'family-sessions' })
const invitations = computed(() => (data.value ?? []).filter(item => item.canConfirm))
</script>

<template>
  <IcSection
    v-if="invitations.length"
    title="Inviti da rispondere"
    description="Conferma la partecipazione o rinuncia: se rinunci, il posto passa a un’altra famiglia."
  >
    <div class="grid gap-4">
      <SessionsInvitationCard v-for="item in invitations" :key="item.id" :item="item" @answered="emit('answered')" />
    </div>
  </IcSection>
</template>
