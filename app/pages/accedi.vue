<script setup lang="ts">
import { loginSchema, type LoginInput } from '#shared/schemas/auth'
import type { LoginResult } from '#shared/types/api'
import { areaRole, safeRedirect } from '#shared/utils/routes'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Accedi · Invictus Camp' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const state = reactive<LoginInput>({ email: '', password: '' })
const loading = ref(false)
const unverified = ref(false)

async function onSubmit() {
  loading.value = true
  unverified.value = false
  try {
    const result = await $fetch<LoginResult>('/api/auth/login', { method: 'POST', body: state })
    await refreshSession()
    const wanted = safeRedirect(route.query.redirect, result.redirectTo)
    const role = areaRole(wanted)
    await navigateTo(role && role !== result.user.role ? result.redirectTo : wanted, { replace: true })
  } catch (error) {
    unverified.value = apiErrorData(error)?.reason === 'email_not_verified'
    if (!unverified.value) notifyError(error, 'Accesso non riuscito')
  } finally {
    loading.value = false
  }
}

async function resend() {
  try {
    await $fetch('/api/auth/resend-verification', { method: 'POST', body: { email: state.email } })
    notifySuccess('Link inviato', `Controlla la casella di ${state.email}, anche nella posta indesiderata.`)
  } catch (error) {
    notifyError(error)
  }
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold text-highlighted">Accedi</h1>
    <p class="mt-2 text-muted">Entra nel gestionale di Invictus Camp.</p>

    <UForm :schema="loginSchema" :state="state" class="mt-8 space-y-5" @submit="onSubmit">
      <UFormField label="Email" name="email" required>
        <UInput v-model="state.email" type="email" autocomplete="email" size="lg" class="w-full" />
      </UFormField>
      <UFormField label="Password" name="password" required>
        <template #hint>
          <ULink to="/password-dimenticata" class="text-sm font-semibold text-primary">Password dimenticata?</ULink>
        </template>
        <IcPasswordInput v-model="state.password" autocomplete="current-password" />
      </UFormField>

      <UAlert
        v-if="unverified"
        color="warning"
        variant="subtle"
        icon="i-lucide-mail-warning"
        title="Conferma prima il tuo indirizzo email"
        description="Trovi il link nella mail che ti abbiamo inviato dopo la registrazione."
        :actions="[{ label: 'Invia di nuovo il link', color: 'warning', variant: 'outline', onClick: resend }]"
      />

      <UButton type="submit" block size="lg" :loading="loading" label="Accedi" />
    </UForm>

    <div class="mt-10 space-y-3 border-t border-default pt-6 text-sm text-muted">
      <p>
        Vuoi iscrivere la tua famiglia al camp?
        <ULink to="/registrati" class="font-semibold text-primary">Registra la tua famiglia</ULink>
      </p>
      <p>
        Vuoi far parte dello staff?
        <ULink to="/candidati" class="font-semibold text-primary">Candidati</ULink>
      </p>
    </div>
  </div>
</template>
