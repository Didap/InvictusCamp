<script setup lang="ts">
import { z } from 'zod'
import type { HealthConsentResult } from '#shared/types/families'
import { formatDateTime, plural } from '#shared/utils/format'

// The consent to the processing of health data (GDPR art. 9) on /famiglia/membri: given with an
// explicit tick, withdrawn at any time; withdrawing deletes the details already entered and the
// certificates and diagnoses uploaded among the documents.
const props = defineProps<{ consentAt: string | null; membersWithHealth: number; healthDocuments: number }>()
const emit = defineEmits<{ changed: [] }>()

const api = useApi()
const confirm = useConfirm()
const schema = z.object({
  accepted: z.boolean().refine(value => value, { error: 'Spunta la casella per dare il consenso' }),
})
const state = reactive({ accepted: false })
const saving = ref(false)

async function give() {
  saving.value = true
  try {
    await api<HealthConsentResult>('/api/family/members/consent', { method: 'PUT', body: { given: true } })
    state.accepted = false
    notifySuccess('Consenso registrato', 'Ora puoi indicare i dati sulla salute con «Modifica».')
    emit('changed')
  } catch (error) {
    notifyError(error)
  } finally {
    saving.value = false
  }
}

/** What withdrawing deletes, for the confirmation: "i dati sulla salute di 2 componenti e i 3 certificati…". */
function toDelete(members: number, documents: number): string {
  return [
    members ? `i dati sulla salute di ${plural(members, 'componente', 'componenti')}` : '',
    documents === 1
      ? 'il certificato medico o la diagnosi che hai caricato'
      : documents
        ? `i ${documents} certificati medici e diagnosi che hai caricato`
        : '',
  ]
    .filter(Boolean)
    .join(' e ')
}

async function withdraw() {
  const lost = toDelete(props.membersWithHealth, props.healthDocuments)
  const ok = await confirm({
    title: 'Ritirare il consenso?',
    description: lost
      ? `Cancelleremo ${lost}. Potrai dare di nuovo il consenso quando vuoi.`
      : 'I campi sui dati sulla salute non saranno più visibili e non potrai caricare certificati medici e diagnosi. Potrai dare di nuovo il consenso quando vuoi.',
    confirmLabel: lost ? 'Ritira e cancella i dati' : 'Ritira il consenso',
    danger: true,
  })
  if (!ok) return
  saving.value = true
  try {
    const result = await api<HealthConsentResult>('/api/family/members/consent', {
      method: 'PUT',
      body: { given: false },
    })
    const deleted = toDelete(result.cleared, result.documentsRemoved)
    notifySuccess(
      'Consenso ritirato',
      deleted ? `Abbiamo cancellato ${deleted}.` : 'Non c’erano dati sulla salute da cancellare.',
    )
    emit('changed')
  } catch (error) {
    notifyError(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="consentAt" class="space-y-4">
    <p class="flex max-w-prose items-start gap-2">
      <UIcon name="i-lucide-shield-check" class="mt-1 size-5 shrink-0 text-success" aria-hidden="true" />
      <span>
        Hai dato il consenso il {{ formatDateTime(consentAt) }}. Con «Modifica» puoi indicare allergie, intolleranze e
        preferenze alimentari di ogni componente e la disabilità dei ragazzi, e caricare certificati medici e diagnosi
        tra i documenti.
      </span>
    </p>
    <UButton
      label="Ritira il consenso"
      color="error"
      variant="outline"
      class="pointer-coarse:min-h-11"
      :loading="saving"
      @click="withdraw"
    />
  </div>

  <UForm v-else :schema="schema" :state="state" class="max-w-prose space-y-4" @submit="give">
    <p>
      Per organizzare il soggiorno ci servono alcune informazioni sulla disabilità e sui bisogni di supporto dei
      ragazzi, e su allergie, intolleranze e preferenze alimentari di tutti. Sono dati particolari: li vedete solo voi e
      l’amministrazione del camp, non finiscono mai nelle email e ogni modifica viene registrata. Il consenso serve
      anche per caricare certificati medici e diagnosi. Puoi ritirarlo quando vuoi: i dati inseriti e i certificati e le
      diagnosi caricati verranno cancellati.
    </p>
    <UFormField name="accepted">
      <FamiliesHealthConsentCheckbox v-model="state.accepted" />
    </UFormField>
    <UButton
      type="submit"
      color="primary"
      variant="outline"
      label="Dai il consenso"
      class="pointer-coarse:min-h-11"
      :loading="saving"
    />
  </UForm>
</template>
