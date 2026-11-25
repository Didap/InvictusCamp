<script setup lang="ts">
// Opened by useConfirm(); resolves with true (confirm) or false (cancel, Esc, outside click).
defineProps<{ title: string; description?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }>()
const emit = defineEmits<{ close: [boolean] }>()
</script>

<template>
  <UModal :title="title" :description="description" :close="false" @update:open="open => !open && emit('close', false)">
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="cancelLabel ?? 'Annulla'" @click="emit('close', false)" />
        <UButton
          :color="danger ? 'error' : 'primary'"
          :label="confirmLabel ?? 'Conferma'"
          @click="emit('close', true)"
        />
      </div>
    </template>
  </UModal>
</template>
