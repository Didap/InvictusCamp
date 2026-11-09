<script setup lang="ts">
import { z } from 'zod'
import { zPrivacy } from '#shared/schemas/auth'
import { zPassword } from '#shared/schemas/common'
import type { InviteInfo } from '#shared/types/api'
import { enumLabel } from '#shared/utils/constants'

definePageMeta({ layout: 'auth' })
useHead({ title: 'Il tuo accesso · Invictus Camp' })

const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const { fetch: refreshSession } = useUserSession()

const {
  data: invite,
  error,
  status,
} = useFetch<InviteInfo>('/api/auth/invite', {
  query: { token },
  immediate: Boolean(token.value),
})

const schema = z
  .object({
    password: zPassword,
    confirm: z.string(),
    privacy: zPrivacy,
  })
  .refine(value => value.password === value.confirm, { path: ['confirm'], error: 'Le due password non coincidono' })
const state = reactive({ password: '', confirm: '', privacy: false })
const loading = ref(false)

async function onSubmit() {
  loading.value = true
  try {
    const result = await $fetch<{ redirectTo: string }>('/api/auth/accept-invite', {
      method: 'POST',
      body: { token: token.value, password: state.password, privacy: state.privacy },
    })
    await refreshSession()
    await navigateTo(result.redirectTo, { replace: true })
  } catch (err) {
    notifyError(err)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <template v-if="!token || error">
      <UIcon name="i-lucide-link-2-off" class="size-10 text-warning" aria-hidden="true" />
      <h1 class="mt-6 text-2xl font-bold text-highlighted">Invito non valido</h1>
      <p class="mt-3 text-muted">
        {{ error ? apiErrorMessage(error) : 'Il link è incompleto: apri di nuovo il link dell’email.' }}
      </p>
      <UButton class="mt-8" to="/accedi" color="neutral" variant="outline" label="Vai all’accesso" />
    </template>

    <div v-else-if="status === 'pending'" class="space-y-4" aria-busy="true">
      <USkeleton class="h-8 w-2/3" />
      <USkeleton class="h-5 w-full" />
    </div>

    <template v-else-if="invite">
      <h1 class="text-2xl font-bold text-highlighted">Ciao {{ invite.firstName }}</h1>
      <p class="mt-2 text-muted">
        Scegli la password per entrare nel gestionale ({{ enumLabel('userRole', invite.role) }}) con
        <strong class="text-highlighted">{{ invite.email }}</strong
        >.
      </p>
      <UForm :schema="schema" :state="state" class="mt-8 space-y-5" @submit="onSubmit">
        <UFormField label="Password" name="password" help="Almeno 10 caratteri." required>
          <IcPasswordInput v-model="state.password" autocomplete="new-password" />
        </UFormField>
        <UFormField label="Ripeti la password" name="confirm" required>
          <IcPasswordInput v-model="state.confirm" autocomplete="new-password" />
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
        <UButton type="submit" block size="lg" :loading="loading" label="Entra nel gestionale" />
      </UForm>
    </template>
  </div>
</template>
