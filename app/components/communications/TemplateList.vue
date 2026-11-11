<script setup lang="ts">
import type { MessageTemplate } from '#shared/types/communications'

// The saved messages (docs/spec.md, 3.7): each one opens the composer already written; add, edit, delete.
const api = useApi()
const confirm = useConfirm()
const { data, refresh } = useApiFetch<MessageTemplate[]>('/api/admin/message-templates')

const editing = ref<MessageTemplate | null>(null)
const modalOpen = ref(false)
function edit(template: MessageTemplate | null) {
  editing.value = template
  modalOpen.value = true
}

async function remove(template: MessageTemplate) {
  const ok = await confirm({
    title: `Elimini «${template.name}»?`,
    description: 'I messaggi già scritti partendo da questo modello restano come sono. Nessuna email parte.',
    confirmLabel: 'Elimina il modello',
    danger: true,
  })
  if (!ok) return
  try {
    const url: string = `/api/admin/message-templates/${template.id}`
    await api(url, { method: 'DELETE' })
    notifySuccess('Modello eliminato')
    await refresh()
  } catch (error) {
    notifyError(error)
  }
}
</script>

<template>
  <div>
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p class="text-muted">I messaggi che scrivi spesso: partendo da un modello cambi solo quello che serve.</p>
      <UButton label="Nuovo modello" icon="i-lucide-plus" color="neutral" variant="outline" @click="edit(null)" />
    </div>

    <UEmpty
      v-if="data && !data.length"
      icon="i-lucide-file-text"
      title="Ancora nessun modello"
      description="Salva i messaggi che scrivi spesso, come la convocazione dello staff o delle famiglie."
    />

    <ul v-else-if="data" class="divide-y divide-default rounded-lg border border-default bg-elevated">
      <li v-for="template in data" :key="template.id" class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-highlighted">{{ template.name }}</p>
          <p class="mt-1 text-sm text-default">{{ template.subject }}</p>
          <p class="mt-1 line-clamp-2 text-sm text-muted">{{ template.body }}</p>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <UButton
            :to="`/admin/comunicazioni/nuova?modello=${template.id}`"
            label="Usa"
            :aria-label="`Usa «${template.name}»`"
            icon="i-lucide-pen-line"
            color="neutral"
            variant="outline"
          />
          <UButton
            label="Modifica"
            :aria-label="`Modifica «${template.name}»`"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            @click="edit(template)"
          />
          <UButton
            :aria-label="`Elimina «${template.name}»`"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            @click="remove(template)"
          />
        </div>
      </li>
    </ul>

    <div v-else class="space-y-2" aria-busy="true">
      <USkeleton v-for="n in 3" :key="n" class="h-20 w-full" />
    </div>

    <CommunicationsTemplateModal v-model:open="modalOpen" :template="editing" @saved="refresh" />
  </div>
</template>
