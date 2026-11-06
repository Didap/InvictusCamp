<script setup lang="ts">
import { z } from 'zod'
import { zPassword } from '#shared/schemas/common'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Nuova password · Invictus Camp' })

const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const { fetch: refreshSession } = useUserSession()

const schema = z
  .object({ password: zPassword, confirm: z.string() })
  .refine(value => value.password === value.confirm, { path: ['confirm'], error: 'Le due password non coincidono' })
const state = reactive({ password: '', confirm: '' })
const loading = ref(false)

async function onSubmit() {
  loading.value = true
  try {
    const result = await $fetch<{ redirectTo: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: { token: token.value, password: state.password },
    })
    await refreshSession()
    notifySuccess('Password aggiornata')
    await navigateTo(result.redirectTo, { replace: true })
  } catch (error) {
    notifyError(error)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold text-highlighted">Scegli una nuova password</h1>
    <template v-if="!token">
      <p class="mt-3 text-muted">Il link è incompleto. Apri di nuovo il link dell’email, oppure chiedine uno nuovo.</p>
      <UButton class="mt-8" to="/password-dimenticata" label="Chiedi un nuovo link" />
    </template>
    <UForm v-else :schema="schema" :state="state" class="mt-8 space-y-5" @submit="onSubmit">
      <UFormField label="Nuova password" name="password" help="Almeno 10 caratteri." required>
        <IcPasswordInput v-model="state.password" autocomplete="new-password" />
      </UFormField>
      <UFormField label="Ripeti la password" name="confirm" required>
        <IcPasswordInput v-model="state.confirm" autocomplete="new-password" />
      </UFormField>
      <UButton type="submit" block size="lg" :loading="loading" label="Salva e accedi" />
    </UForm>
  </div>
</template>
