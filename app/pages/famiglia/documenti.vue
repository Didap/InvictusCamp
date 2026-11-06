<script setup lang="ts">
import type { FamilyMembersResponse, PersonalDocumentDto } from '#shared/types/families'

// The family's documents: the ones to sign (A4's PendingSignatures) and the personal ones it uploads
// (certificates, diagnoses, ID, health card), visible only to the family and the administration.
const api = useApi()
const confirm = useConfirm()
const { data: documents, refresh } = await useApiFetch<PersonalDocumentDto[]>('/api/family/documents')
const { data: members } = await useApiFetch<FamilyMembersResponse>('/api/family/members')

async function remove(document: PersonalDocumentDto) {
  const ok = await confirm({
    title: `Eliminare «${document.title}»?`,
    description: 'Il file verrà cancellato e l’amministrazione non lo vedrà più.',
    confirmLabel: 'Elimina',
    danger: true,
  })
  if (!ok) return
  try {
    await api(`/api/family/documents/${document.id}`, { method: 'DELETE' })
    notifySuccess('Documento eliminato', document.title)
    await refresh()
  } catch (error) {
    notifyError(error, 'Documento non eliminato')
  }
}
</script>

<template>
  <IcPage title="Documenti" width="narrow">
    <IcSection title="Da firmare" description="I documenti che il camp ti chiede di leggere e firmare.">
      <DocumentsPendingSignatures />
    </IcSection>

    <IcSection
      title="I tuoi documenti"
      description="Certificati, diagnosi, documenti d’identità e tessere sanitarie. Li vedete solo voi e l’amministrazione del camp."
    >
      <FamiliesDocumentsList v-if="documents?.length" :documents="documents" removable @remove="remove" />
      <UEmpty
        v-else
        icon="i-lucide-folder-open"
        title="Nessun documento caricato"
        description="Carica qui sotto i documenti che il camp ti chiede, per esempio il certificato medico."
      />
    </IcSection>

    <IcSection title="Carica un documento" description="Scegli il tipo e la persona a cui si riferisce, poi il file.">
      <FamiliesDocumentUploadForm
        :members="members?.members ?? []"
        :health-consent="Boolean(members?.healthDataConsentAt)"
        @uploaded="refresh"
      />
    </IcSection>
  </IcPage>
</template>
