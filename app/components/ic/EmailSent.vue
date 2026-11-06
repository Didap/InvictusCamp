<script setup lang="ts">
// After a registration: "check your email", with a way to ask for the link again.
const props = defineProps<{ email: string }>()
const sending = ref(false)

async function resend() {
  sending.value = true
  try {
    await $fetch('/api/auth/resend-verification', { method: 'POST', body: { email: props.email } })
    notifySuccess('Link inviato di nuovo', `Controlla la casella di ${props.email}, anche nella posta indesiderata.`)
  } catch (error) {
    notifyError(error)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div>
    <UIcon name="i-lucide-mail-check" class="size-10 text-primary" aria-hidden="true" />
    <h1 class="mt-6 text-2xl font-bold text-highlighted">Controlla la tua email</h1>
    <p class="mt-3 text-muted">
      Ti abbiamo inviato un link a <strong class="text-highlighted">{{ email }}</strong
      >. Aprilo per confermare l’indirizzo ed entrare nel gestionale. Il link vale 48 ore.
    </p>
    <div class="mt-8 flex flex-wrap gap-3">
      <UButton
        color="neutral"
        variant="outline"
        :loading="sending"
        label="Non è arrivata? Inviala di nuovo"
        @click="resend"
      />
      <UButton to="/accedi" variant="link" label="Vai all’accesso" />
    </div>
  </div>
</template>
