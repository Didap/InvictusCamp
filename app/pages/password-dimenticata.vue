<script setup lang="ts">
import { forgotPasswordSchema } from '#shared/schemas/auth'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Password dimenticata · Invictus Camp' })

const state = reactive({ email: '' })
const loading = ref(false)
const sent = ref(false)

async function onSubmit() {
  loading.value = true
  try {
    await $fetch('/api/auth/forgot-password', { method: 'POST', body: state })
    sent.value = true
  } catch (error) {
    notifyError(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold text-highlighted">Password dimenticata</h1>
    <template v-if="sent">
      <p class="mt-3 text-muted">
        Se <strong class="text-highlighted">{{ state.email }}</strong> ha un account, riceverai un link per scegliere
        una nuova password. Il link vale un’ora.
      </p>
      <UButton class="mt-8" to="/accedi" color="neutral" variant="outline" label="Torna all’accesso" />
    </template>
    <template v-else>
      <p class="mt-2 text-muted">
        Scrivi l’email del tuo account: ti invieremo un link per scegliere una nuova password.
      </p>
      <UForm :schema="forgotPasswordSchema" :state="state" class="mt-8 space-y-5" @submit="onSubmit">
        <UFormField label="Email" name="email" required>
          <UInput v-model="state.email" type="email" autocomplete="email" size="lg" class="w-full" />
        </UFormField>
        <UButton type="submit" block size="lg" :loading="loading" label="Invia il link" />
      </UForm>
      <p class="mt-8 text-sm text-muted">
        Ti è tornata in mente? <ULink to="/accedi" class="font-semibold text-primary">Accedi</ULink>
      </p>
    </template>
  </div>
</template>
