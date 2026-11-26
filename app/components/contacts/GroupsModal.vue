<script setup lang="ts">
import { plural } from '#shared/utils/format'

// The groups of the «Anagrafica» (spec 3.16): created, renamed (a name is saved when the field is left) and
// deleted here. Deleting a group keeps its contacts.
const open = defineModel<boolean>('open', { default: false })
/** A group was deleted: the page refreshes its contacts and leaves a filter on it. */
const emit = defineEmits<{ deleted: [id: string] }>()

const api = useApi()
const confirm = useConfirm()
const { groups, create, refresh } = useContactGroups()

const names = ref<Record<string, string>>({})
watch(
  groups,
  value => {
    names.value = Object.fromEntries(value.map(group => [group.id, group.name]))
  },
  { immediate: true },
)

const busy = ref(false)
/** Runs a change and reloads the groups; false when it failed (the error is shown). */
async function run(action: () => Promise<unknown>, success: string): Promise<boolean> {
  busy.value = true
  try {
    await action()
    notifySuccess(success)
    return true
  } catch (error) {
    notifyError(error)
    return false
  } finally {
    await refresh()
    busy.value = false
  }
}

function rename(group: { id: string; name: string }) {
  const name = (names.value[group.id] ?? '').trim()
  if (!name || name === group.name) {
    names.value[group.id] = group.name
    return
  }
  const url: string = `/api/admin/contact-groups/${group.id}`
  return run(() => api<{ ok: true }>(url, { method: 'PUT', body: { name } }), 'Gruppo rinominato')
}

async function remove(group: { id: string; name: string; count: number }) {
  const ok = await confirm({
    title: `Elimini il gruppo «${group.name}»?`,
    description: group.count
      ? `${plural(group.count, 'contatto resta', 'contatti restano')} in anagrafica, senza questo gruppo. Nessuna email parte.`
      : 'È vuoto. Nessuna email parte.',
    confirmLabel: 'Elimina',
    danger: true,
  })
  if (!ok) return
  const url: string = `/api/admin/contact-groups/${group.id}`
  if (await run(() => api<{ ok: true }>(url, { method: 'DELETE' }), 'Gruppo eliminato')) emit('deleted', group.id)
}

const fresh = ref('')
async function add() {
  const name = fresh.value.trim()
  if (!name) return
  busy.value = true
  if (await create(name)) fresh.value = ''
  busy.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Gruppi"
    description="Per tenere insieme i contatti: un contatto può stare in più gruppi. Un nome si salva quando esci dal campo."
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <ul class="divide-y divide-default rounded-lg border border-default">
        <li v-for="group in groups" :key="group.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
          <UInput
            v-model="names[group.id]"
            :aria-label="`Nome del gruppo ${group.name}`"
            :maxlength="80"
            :disabled="busy"
            class="min-w-0 flex-1 basis-48"
            @change="rename(group)"
          />
          <span class="text-sm text-muted tabular-nums">{{ plural(group.count, 'contatto', 'contatti') }}</span>
          <UButton
            icon="i-lucide-trash-2"
            color="neutral"
            variant="ghost"
            :aria-label="`Elimina il gruppo ${group.name}`"
            :disabled="busy"
            @click="remove(group)"
          />
        </li>
        <li v-if="!groups.length" class="p-4 text-muted">Nessun gruppo: crea il primo qui sotto.</li>
      </ul>

      <form class="mt-4 flex flex-wrap items-end gap-3" @submit.prevent="add">
        <UFormField label="Nuovo gruppo" class="min-w-0 flex-1 basis-56">
          <UInput v-model="fresh" :maxlength="80" placeholder="Es. Famiglie 2026" class="w-full" />
        </UFormField>
        <UButton type="submit" icon="i-lucide-plus" label="Crea" :disabled="!fresh.trim()" :loading="busy" />
      </form>
    </template>
  </UModal>
</template>
