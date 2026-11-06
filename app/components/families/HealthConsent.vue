<script setup lang="ts">
import { z } from 'zod'
import type { HealthConsentResult } from '#shared/types/families'
import { formatDateTime, plural } from '#shared/utils/format'

// The consent to the processing of health data (GDPR art. 9) on /famiglia/membri: given with an
// explicit tick, withdrawn at any time; withdrawing deletes the details already entered.
const props = defineProps<{ consentAt: string | null; membersWithHealth: number }>()
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

async function withdraw() {
  const count = props.membersWithHealth
  const ok = await confirm({
    title: 'Ritirare il consenso?',
    description: count
      ? `I dati sulla salute di ${plural(count, 'componente', 'componenti')} verranno cancellati. Potrai dare di nuovo il consenso quando vuoi.`
      : 'I campi sui dati sulla salute non saranno più visibili. Potrai dare di nuovo il consenso quando vuoi.',
    confirmLabel: count ? 'Ritira e cancella i dati' : 'Ritira il consenso',
    danger: true,
  })
  if (!ok) return
  saving.value = true
  try {
    const result = await api<HealthConsentResult>('/api/family/members/consent', {
      method: 'PUT',
      body: { given: false },
    })
    notifySuccess(
      'Consenso ritirato',
      result.cleared ? 'I dati sulla salute sono stati cancellati.' : 'Non c’erano dati sulla salute da cancellare.',
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
        Hai dato il consenso il {{ formatDateTime(consentAt) }}. Puoi indicare la disabilità e i bisogni di supporto di
        ogni componente con «Modifica».
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
      Per organizzare il soggiorno ci servono alcune informazioni sulla disabilità e sui bisogni di supporto. Sono dati
      particolari: li vedete solo voi e l’amministrazione del camp, non finiscono mai nelle email e ogni modifica viene
      registrata. Puoi ritirare il consenso quando vuoi: i dati inseriti verranno cancellati.
    </p>
    <UFormField name="accepted">
      <UCheckbox
        v-model="state.accepted"
        label="Acconsento al trattamento dei dati sulla salute dei componenti della mia famiglia"
      >
        <template #description>
          Come descritto
          <ULink to="/privacy" target="_blank" class="font-semibold text-primary underline"
            >nell’informativa privacy</ULink
          >.
        </template>
      </UCheckbox>
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
