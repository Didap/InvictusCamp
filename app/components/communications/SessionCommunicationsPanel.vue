<script setup lang="ts">
// CONTRACT (docs/BUILD.md): owned by A5 Comunicazioni. Admin session page, tab "Comunicazioni": the
// messages written to the session's people, every email of the session (automatic and manual), and
// the buttons to write to its families or its staff.
const props = defineProps<{ sessionId: string }>()

const writeTo = (audience: 'session_families' | 'session_staff') =>
  `/admin/comunicazioni/nuova?audience=${audience}&sessionId=${props.sessionId}`
</script>

<template>
  <div>
    <IcSection title="Messaggi" description="Scritti dal gestionale alle famiglie o allo staff di questa sessione.">
      <template #actions>
        <UButton
          :to="writeTo('session_families')"
          icon="i-lucide-heart-handshake"
          label="Scrivi alle famiglie"
          color="neutral"
          variant="outline"
        />
        <UButton
          :to="writeTo('session_staff')"
          icon="i-lucide-id-card"
          label="Scrivi allo staff"
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
