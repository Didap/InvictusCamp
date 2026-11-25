<script setup lang="ts">
import { z } from 'zod'
import { registerStaffSchema } from '#shared/schemas/auth'
import { MAX_UPLOAD_BYTES } from '#shared/utils/constants'
import { teamOfSlug } from '#shared/utils/routes'

definePageMeta({ layout: 'auth' })

// The application (spec 3.4): the account and the CV in PDF, nothing else. From «Vuoi far parte del
// v-team?» it is for the v-team.
const route = useRoute()
const team = computed(() => teamOfSlug(route.query.squadra))
const title = computed(() =>
  team.value === 'volunteer'
    ? 'Entra nel v-team, la squadra di volontari e volontarie. Candidati!'
    : 'Entra nel team di Invictus Camp, candidati!',
)
useHead({
  title: () => `${team.value === 'volunteer' ? 'Candidati per il v-team' : 'Candidati per lo staff'} · Invictus Camp`,
})

const schema = registerStaffSchema.extend({
  cv: z
    .instanceof(File, { error: 'Carica il tuo CV in PDF' })
    .refine(file => file.type === 'application/pdf', { error: 'Il CV va caricato in PDF' })
    .refine(file => file.size <= MAX_UPLOAD_BYTES, { error: 'Il file supera 15 MB' }),
})
const state = reactive({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  privacy: false,
  cv: null as File | null,
})
const touch = useMediaQuery('(pointer: coarse)')
const loading = ref(false)
const sentTo = ref<string | null>(null)

async function onSubmit() {
  if (!state.cv) return
  const form = new FormData()
  form.append('file', state.cv)
  form.append('team', team.value)
  for (const key of ['firstName', 'lastName', 'email', 'phone', 'password'] as const) form.append(key, state[key])
  form.append('privacy', String(state.privacy))
  loading.value = true
  try {
    const result = await $fetch<{ email: string }>('/api/auth/register-staff', { method: 'POST', body: form })
    sentTo.value = result.email
  } catch (error) {
    notifyError(error, 'Candidatura non inviata')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <IcEmailSent v-if="sentTo" :email="sentTo" />
  <div v-else>
    <h1 class="text-2xl font-bold text-highlighted">{{ title }}</h1>
    <p class="mt-2 text-muted">Crea il tuo account, carica il tuo CV e attendi il nostro riscontro. Grazie!</p>

    <UForm :schema="schema" :state="state" class="mt-8 space-y-5" @submit="onSubmit">
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
      <UFormField label="Telefono" name="phone" required>
        <UInput v-model="state.phone" type="tel" autocomplete="tel" size="lg" class="w-full" />
      </UFormField>
      <UFormField label="Password" name="password" help="Almeno 8 caratteri." required>
        <IcPasswordInput v-model="state.password" autocomplete="new-password" />
      </UFormField>
      <UFormField label="Il tuo CV" name="cv" required>
        <UFileUpload
          v-model="state.cv"
          accept="application/pdf"
          :label="touch ? 'Scegli il file dal dispositivo' : 'Trascina qui il file o sceglilo dal dispositivo'"
          description="PDF, fino a 15 MB"
          icon="i-lucide-upload"
          :disabled="loading"
          class="min-h-36 w-full"
        />
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
      <UButton type="submit" block size="lg" :loading="loading" label="Invia la candidatura" />
    </UForm>

    <p class="mt-8 text-sm text-muted">
      Hai già un account? <ULink to="/accedi" class="font-semibold text-primary">Accedi</ULink>
    </p>
  </div>
</template>
