<script setup lang="ts">
import type { SessionConvocation } from '#shared/types/staff'
import { fullName } from '#shared/utils/format'

// "Invia la convocazione": says who receives it and how many emails leave, takes an optional message.
const props = defineProps<{ sessionId: string; sessionTitle: string; convocations: SessionConvocation[] }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ sent: [] }>()

const api = useApi()
const { label } = useEnums()
const message = ref('')
const sending = ref(false)

watch(open, value => {
  if (value) message.value = ''
})

const count = computed(() => props.convocations.length)
const title = computed(() => (count.value === 1 ? 'Invia la convocazione' : `Invia ${count.value} convocazioni`))
const description = computed(() =>
  count.value === 1
    ? `Partirà 1 email per «${props.sessionTitle}».`
    : `Partiranno ${count.value} email per «${props.sessionTitle}», una per persona.`,
)

async function send() {
  sending.value = true
  try {
    const result = await api<{ sent: number; skipped: number; failed: number }>('/api/admin/convocations/send', {
      method: 'POST',
      body: {
        sessionId: props.sessionId,
        ids: props.convocations.map(convocation => convocation.id),
        message: message.value.trim() || null,
      },
    })
    notifySuccess(
      result.sent === 1 ? 'Convocazione inviata' : `${result.sent} convocazioni inviate`,
      result.failed ? `${result.failed} email non recapitate: controlla il registro delle email.` : undefined,
    )
    open.value = false
    emit('sent')
  } catch (error) {
    notifyError(error, 'Invio non riuscito')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="title" :description="description">
    <template #body>
      <div class="space-y-5">
        <div>
          <p class="text-sm font-semibold text-muted">{{ count === 1 ? 'Destinatario' : 'Destinatari' }}</p>
          <ul class="mt-1 space-y-1">
            <li v-for="convocation in convocations" :key="convocation.id">
              <span class="font-semibold text-highlighted">{{ fullName(convocation) }}</span>
              <span v-if="convocation.role" class="text-muted">, {{ label('staffRole', convocation.role) }}</span>
            </li>
          </ul>
        </div>
        <UFormField
          label="Messaggio"
          hint="Facoltativo"
          help="Compare nella email e nel gestionale, insieme a sessione, date, luogo e ruolo."
        >
          <UTextarea v-model="message" :rows="4" :maxlength="2000" autoresize class="w-full" />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton
          class="pointer-coarse:min-h-11"
          color="neutral"
          variant="outline"
          label="Annulla"
          @click="open = false"
        />
        <UButton class="pointer-coarse:min-h-11" icon="i-lucide-send" :label="title" :loading="sending" @click="send" />
      </div>
    </template>
  </UModal>
</template>
