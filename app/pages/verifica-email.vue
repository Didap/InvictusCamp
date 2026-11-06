<script setup lang="ts">
definePageMeta({ layout: 'auth' })
useHead({ title: 'Conferma dell’email · Invictus Camp' })

const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const failure = ref<string | null>(null)

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  if (!token) {
    failure.value = 'Il link è incompleto: apri di nuovo il link dell’email.'
    return
  }
  try {
    const result = await $fetch<{ redirectTo: string }>('/api/auth/verify-email', { method: 'POST', body: { token } })
    await refreshSession()
    notifySuccess('Indirizzo confermato', 'Benvenuto nel gestionale di Invictus Camp.')
    await navigateTo(result.redirectTo, { replace: true })
  } catch (error) {
    failure.value = apiErrorMessage(error)
  }
})
</script>

<template>
  <div>
    <template v-if="failure">
      <UIcon name="i-lucide-link-2-off" class="size-10 text-warning" aria-hidden="true" />
      <h1 class="mt-6 text-2xl font-bold text-highlighted">Non riusciamo a confermare l’indirizzo</h1>
      <p class="mt-3 text-muted">{{ failure }}</p>
      <p class="mt-3 text-muted">Dalla pagina di accesso puoi chiedere un nuovo link.</p>
      <UButton class="mt-8" to="/accedi" label="Vai all’accesso" />
    </template>
    <div v-else class="flex items-center gap-3" role="status">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-primary" aria-hidden="true" />
      <p class="text-lg font-semibold text-highlighted">Confermo il tuo indirizzo…</p>
    </div>
  </div>
</template>
