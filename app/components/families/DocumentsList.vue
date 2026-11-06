<script setup lang="ts">
import type { PersonalDocumentDto } from '#shared/types/families'
import { enumLabel } from '#shared/utils/constants'
import { todayIso } from '#shared/utils/dates'
import { formatDay, fullName } from '#shared/utils/format'

// The personal documents of a family: title (opens the file), type, who it refers to, when.
// `removable` adds a delete button (the family's own page); the parent confirms and deletes.
defineProps<{ documents: PersonalDocumentDto[]; removable?: boolean }>()
const emit = defineEmits<{ remove: [document: PersonalDocumentDto] }>()

function details(document: PersonalDocumentDto): string {
  const who = document.member ? `Riguarda ${fullName(document.member)}` : 'Tutta la famiglia'
  const day = formatDay(todayIso(new Date(document.createdAt)))
  return `${enumLabel('personalDocumentCategory', document.category)} · ${who} · Caricato il ${day}`
}
</script>

<template>
  <ul class="divide-y divide-default rounded-lg border border-default bg-elevated">
    <li v-for="document in documents" :key="document.id" class="flex items-start gap-3 p-4">
      <div class="min-w-0 flex-1 space-y-1">
        <IcFileLink :file="document.file" :label="document.title" />
        <p class="text-sm text-muted">{{ details(document) }}</p>
      </div>
      <UButton
        v-if="removable"
        icon="i-lucide-trash-2"
        color="error"
        variant="ghost"
        class="pointer-coarse:min-h-11 pointer-coarse:min-w-11 justify-center"
        :aria-label="`Elimina ${document.title}`"
        @click="emit('remove', document)"
      />
    </li>
  </ul>
</template>
