<script setup lang="ts">
import { registerFamilySchema } from '#shared/schemas/auth'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Registra la tua famiglia · Invictus Camp' })

const state = reactive({
  familyName: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  privacy: false,
})
const loading = ref(false)
const sentTo = ref<string | null>(null)

async function onSubmit() {
  loading.value = true
  try {
    const result = await $fetch<{ email: string }>('/api/auth/register-family', {
      method: 'POST',
      body: state,
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
    <h1 class="text-2xl font-bold text-highlighted">Registra la tua famiglia</h1>
    <p class="mt-2 text-muted">
      Crea l’account della tua famiglia: poi potrai inserire i componenti, compilare la scheda e seguire le sessioni del
      camp.
    </p>

    <UForm :schema="registerFamilySchema" :state="state" class="mt-8 space-y-5" @submit="onSubmit">
      <UFormField label="Nome della famiglia" name="familyName" help="Per esempio: Famiglia Rossi" required>
        <UInput v-model="state.familyName" size="lg" class="w-full" />
      </UFormField>
      <div class="grid gap-5 sm:grid-cols-2">
        <UFormField label="Nome del referente" name="firstName" required>
          <UInput v-model="state.firstName" autocomplete="given-name" size="lg" class="w-full" />
        </UFormField>
        <UFormField label="Cognome del referente" name="lastName" required>
          <UInput v-model="state.lastName" autocomplete="family-name" size="lg" class="w-full" />
        </UFormField>
      </div>
      <UFormField label="Email" name="email" help="La useremo per gli inviti e le comunicazioni del camp." required>
        <UInput v-model="state.email" type="email" autocomplete="email" size="lg" class="w-full" />
      </UFormField>
      <UFormField label="Telefono" name="phone" required>
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
      Ti occorre supporto per la registrazione? <IcContactLine as="span" audience="families" />
    </p>
    <p class="mt-2 text-sm text-muted">
      Hai già un account? <ULink to="/accedi" class="font-semibold text-primary">Accedi</ULink>
    </p>
  </div>
</template>
