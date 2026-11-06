<script setup lang="ts">
import type { SessionInput } from '#shared/schemas/sessions'
import type { SessionCreated } from '#shared/types/sessions'

const api = useApi()
const saving = ref(false)

async function create(values: SessionInput) {
  saving.value = true
  try {
    const { id } = await api<SessionCreated>('/api/admin/sessions', { method: 'POST', body: values })
    notifySuccess('Sessione creata', 'È in bozza: aggiungi le famiglie, poi apri gli inviti.')
    await navigateTo(`/admin/sessioni/${id}`)
  } catch (error) {
    notifyError(error, 'Sessione non creata')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <IcPage
    title="Nuova sessione"
    back="/admin/sessioni"
    width="narrow"
    description="La sessione nasce in bozza: le famiglie non ricevono nulla finché non apri gli inviti."
  >
    <SessionsForm submit-label="Crea la sessione" :loading="saving" @submit="create" />
  </IcPage>
</template>
