<script setup lang="ts">
import { enumMeta } from '#shared/utils/constants'
import { writeToSessionTeam } from '#shared/utils/routes'

// CONTRACT (docs/BUILD.md): owned by A5 Comunicazioni. Admin session page, tab "Comunicazioni": the
// messages written to the session's people, every email of the session (automatic and manual), and
// the buttons to write to its families, its staff or its v-team.
const props = defineProps<{ sessionId: string }>()

const writeToFamilies = computed(
  () => `/admin/comunicazioni/nuova?audience=session_families&sessionId=${props.sessionId}`,
)
</script>

<template>
  <div>
    <IcSection
      title="Messaggi"
      description="Scritti dal gestionale alle famiglie, allo staff o al v-team di questa sessione."
    >
      <template #actions>
        <UButton
          :to="writeToFamilies"
          icon="i-lucide-heart-handshake"
          label="Scrivi alle famiglie"
          color="neutral"
          variant="outline"
        />
        <UButton
          :to="writeToSessionTeam(sessionId, 'staff')"
          :icon="enumMeta('staffTeam', 'staff').icon"
          label="Scrivi allo staff"
          color="neutral"
          variant="outline"
        />
        <UButton
          :to="writeToSessionTeam(sessionId, 'volunteer')"
          :icon="enumMeta('staffTeam', 'volunteer').icon"
          label="Scrivi al v-team"
          color="neutral"
          variant="outline"
        />
      </template>
      <CommunicationsCommunicationList :session-id="sessionId" :page-size="10" />
    </IcSection>

    <IcSection
      title="Email della sessione"
      description="Ogni email legata alla sessione: inviti, conferme, convocazioni, messaggi."
    >
      <CommunicationsEmailLog :session-id="sessionId" :page-size="10" />
    </IcSection>
  </div>
</template>
