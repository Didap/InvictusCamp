<script setup lang="ts">
import { registerStaffSchema } from '#shared/schemas/auth'
import type { StaffTeam } from '#shared/utils/constants'
import { V_TEAM_QUERY } from '#shared/utils/routes'

definePageMeta({ layout: 'auth' })

// From «Vuoi far parte del v-team?» the account is born for the v-team; the application can still change it.
const route = useRoute()
const team = computed<StaffTeam>(() => (route.query.squadra === V_TEAM_QUERY ? 'volunteer' : 'staff'))
const title = computed(() => (team.value === 'volunteer' ? 'Candidati per il v-team' : 'Candidati per lo staff'))
useHead({ title: () => `${title.value} · Invictus Camp` })

const state = reactive({ firstName: '', lastName: '', email: '', phone: '', password: '', privacy: false })
const loading = ref(false)
const sentTo = ref<string | null>(null)

async function onSubmit() {
  loading.value = true
  try {
    const result = await $fetch<{ email: string }>('/api/auth/register-staff', {
      method: 'POST',
      body: { ...state, team: team.value, phone: state.phone || undefined },
    })
    sentTo.value = result.email
  } catch (error) {
    notifyError(error, 'Registrazione non riuscita')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <IcEmailSent v-if="sentTo" :email="sentTo" />
  <div v-else>
    <h1 class="text-2xl font-bold text-highlighted">{{ title }}</h1>
    <p class="mt-2 text-muted">
      Crea il tuo account. Nel gestionale completerai la candidatura con le tue esperienze e il curriculum: dopo la
      valutazione ti scriveremo noi.
    </p>

    <UForm :schema="registerStaffSchema" :state="state" class="mt-8 space-y-5" @submit="onSubmit">
      <div class="grid gap-5 sm:grid-cols-2">
        <UFormField label="Nome" name="firstName" required>
          <UInput v-model="state.firstName" autocomplete="given-name" size="lg" class="w-full" />
        </UFormField>
        <UFormField label="Cognome" name="lastName" required>
          <UInput v-model="state.lastName" autocomplete="family-name" size="lg" class="w-full" />
        </UFormField>
      </div>
      <UFormField label="Email" name="email" required>
        <UInput v-model="state.email" type="email" autocomplete="email" size="lg" class="w-full" />
      </UFormField>
      <UFormField label="Telefono" name="phone" hint="Facoltativo">
        <UInput v-model="state.phone" type="tel" autocomplete="tel" size="lg" class="w-full" />
      </UFormField>
      <UFormField label="Password" name="password" help="Almeno 10 caratteri." required>
        <IcPasswordInput v-model="state.password" autocomplete="new-password" />
      </UFormField>
      <UFormField name="privacy">
        <UCheckbox v-model="state.privacy">
          <template #label>
            Ho letto l’<ULink to="/privacy" target="_blank" class="font-semibold text-primary underline"
              >informativa privacy</ULink
            >
          </template>
        </UCheckbox>
      </UFormField>
      <UButton type="submit" block size="lg" :loading="loading" label="Crea l’account" />
    </UForm>

    <p class="mt-8 text-sm text-muted">
      Hai già un account? <ULink to="/accedi" class="font-semibold text-primary">Accedi</ULink>
    </p>
  </div>
</template>
