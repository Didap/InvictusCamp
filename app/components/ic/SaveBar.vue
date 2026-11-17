<script setup lang="ts">
import { formatDateTime } from '#shared/utils/format'

// The bar of an editor that saves as a whole (the programme, the family questionnaire): sticky under the
// navbar, it says whether there are unsaved changes or when and by whom the last save was, and holds
// «Annulla le modifiche» (asked first, `discard` only once confirmed) and «Salva».
const props = defineProps<{
  dirty: boolean
  saving: boolean
  updatedAt: string | null
  updatedByName: string | null
  /** Shown when nothing was ever saved. */
  neverSaved?: string
  /** The confirm of «Annulla le modifiche», e.g. «Il programma torna com’era all’ultimo salvataggio.» */
  discardDescription: string
}>()
const emit = defineEmits<{ save: []; discard: [] }>()

const confirm = useConfirm()
async function discard() {
  const ok = await confirm({
    title: 'Annullare le modifiche?',
    description: props.discardDescription,
    confirmLabel: 'Annulla le modifiche',
    cancelLabel: 'Continua a modificare',
    danger: true,
  })
  if (ok) emit('discard')
}
</script>

<template>
  <!-- Negative top = the body padding of IcPage (p-4 sm:p-6 lg:p-8): the bar sits flush under the navbar. -->
  <div
    class="sticky -top-4 z-10 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-default bg-default py-3 sm:-top-6 lg:-top-8"
  >
    <p class="flex items-center gap-2 text-sm" role="status">
      <template v-if="dirty">
        <UIcon name="i-lucide-circle-dot" class="size-4 shrink-0 text-warning" aria-hidden="true" />
        Modifiche non salvate
      </template>
      <template v-else>
        <UIcon name="i-lucide-circle-check" class="size-4 shrink-0 text-success" aria-hidden="true" />
        <template v-if="updatedAt">
          Salvato il {{ formatDateTime(updatedAt) }}<template v-if="updatedByName"> da {{ updatedByName }}</template>
        </template>
        <template v-else>{{ neverSaved }}</template>
      </template>
    </p>
    <div class="flex flex-wrap gap-2">
      <UButton
        v-if="dirty"
        color="neutral"
        variant="outline"
        label="Annulla le modifiche"
        class="pointer-coarse:min-h-11"
        :disabled="saving"
        @click="discard"
      />
      <UButton
        icon="i-lucide-save"
        label="Salva"
        class="pointer-coarse:min-h-11"
        :disabled="!dirty"
        :loading="saving"
        @click="emit('save')"
      />
    </div>
  </div>
</template>
