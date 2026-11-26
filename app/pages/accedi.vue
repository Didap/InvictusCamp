<script setup lang="ts">
import { loginSchema, type LoginInput } from '#shared/schemas/auth'
import type { LoginResult } from '#shared/types/api'
import { enumMeta } from '#shared/utils/constants'
import { areaRole, safeRedirect, TEAM_SLUG } from '#shared/utils/routes'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Accedi · Invictus Camp' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const state = reactive<LoginInput>({ email: '', password: '' })
const loading = ref(false)
const unverified = ref(false)

/** The ways in for whoever has no account yet: the family, the staff, the v-team. */
const WAYS_IN = [
  {
    to: '/registrati',
    icon: 'i-lucide-house-heart',
    question: 'Vuoi iscrivere la tua famiglia al camp?',
    action: 'Registra la tua famiglia',
  },
  {
    to: '/candidati',
    icon: enumMeta('staffTeam', 'staff').icon,
    question: 'Vuoi far parte dello staff?',
    action: 'Candidati per lo staff',
  },
  {
    to: `/candidati?squadra=${TEAM_SLUG.volunteer}`,
    icon: enumMeta('staffTeam', 'volunteer').icon,
    question: 'Vuoi far parte del v-team (volontari e volontarie)?',
    action: 'Candidati per il v-team',
  },
]

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
    <p class="mt-2 text-muted">Accedi al “dietro le quinte” di Invictus Camp.</p>

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

    <section class="mt-10 border-t border-default pt-6" aria-labelledby="first-time">
      <h2 id="first-time" class="font-semibold text-highlighted">Non hai ancora un account?</h2>
      <ul class="mt-4 space-y-3">
        <li v-for="way in WAYS_IN" :key="way.to">
          <NuxtLink
            :to="way.to"
            class="flex items-center gap-3 rounded-lg border border-default p-4 transition-colors hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
          >
            <UIcon :name="way.icon" class="size-6 shrink-0 text-primary" aria-hidden="true" />
            <span class="min-w-0 flex-1">
              <span class="block text-sm text-muted">{{ way.question }}</span>
              <span class="block font-semibold text-primary">{{ way.action }}</span>
            </span>
            <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-dimmed" aria-hidden="true" />
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
