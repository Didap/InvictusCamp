<script setup lang="ts">
import { PROTECTED_ROLES, type StaffTagColor } from '#shared/utils/constants'
import { andList, plural } from '#shared/utils/format'

// The roles of staff and v-team and the tags of the «Valutazione» (spec 3.4): the administration creates,
// renames and deletes them here. A name is saved when the field is left; deleting takes the role or the
// tag away from everyone who has it.
const open = defineModel<boolean>('open', { default: false })
/** A role or a tag was deleted: the people who had it changed. Names refresh by themselves (useStaffLabels). */
const emit = defineEmits<{ deleted: [] }>()

const api = useApi()
const confirm = useConfirm()
const { options } = useEnums()
const { roles, tags, refresh } = useStaffLabels()

type Kind = 'role' | 'tag'
const kind = ref<Kind>('role')
const kindItems = [
  { label: 'Ruoli', value: 'role' },
  { label: 'Valutazione', value: 'tag' },
]
const colorItems = options('staffTagColor').map(option => ({ label: option.label, value: option.value }))
const base = (k: Kind): string => (k === 'role' ? '/api/admin/staff/roles' : '/api/admin/staff/tags')
/** What the server takes for a role (a name) or a tag (a name and a colour). */
const bodyOf = (k: Kind, name: string, color?: StaffTagColor): Record<string, string> =>
  k === 'tag' && color ? { name, color } : { name }

/** The names (and colours) being edited, by id: reset from the server after every change. */
const names = ref<Record<string, string>>({})
watch(
  [roles, tags],
  () => {
    names.value = Object.fromEntries([...roles.value, ...tags.value].map(item => [item.id, item.name]))
  },
  { immediate: true },
)
watch(open, value => {
  if (value) refresh()
})

const busy = ref(false)
/** Runs a change and reloads the lists; false when it failed (the error is shown). */
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

function save(k: Kind, item: { id: string; name: string; color?: StaffTagColor }, color = item.color) {
  const name = (names.value[item.id] ?? '').trim()
  if (!name) {
    names.value[item.id] = item.name
    return
  }
  if (name === item.name && color === item.color) return
  const url: string = `${base(k)}/${item.id}`
  return run(() => api<{ ok: true }>(url, { method: 'PUT', body: bodyOf(k, name, color) }), 'Modifica salvata')
}

async function remove(k: Kind, item: { id: string; name: string; people: number; convocations?: number }) {
  const who = andList(holders(item))
  const ok = await confirm({
    title: `Elimini «${item.name}»?`,
    description: who
      ? `Ce l’hanno ${who}: lo perdono. Nessuna email parte.`
      : 'Non ce l’ha ancora nessuno. Nessuna email parte.',
    confirmLabel: 'Elimina',
    danger: true,
  })
  if (!ok) return
  const url: string = `${base(k)}/${item.id}`
  if (
    await run(() => api<{ ok: true }>(url, { method: 'DELETE' }), k === 'role' ? 'Ruolo eliminato' : 'Tag eliminato')
  ) {
    emit('deleted')
  }
}

const fresh = reactive({ name: '', color: 'neutral' as StaffTagColor })
watch(kind, () => {
  fresh.name = ''
})
async function add() {
  const name = fresh.name.trim()
  if (!name) return
  const url = base(kind.value)
  const added = await run(
    () => api<{ id: string }>(url, { method: 'POST', body: bodyOf(kind.value, name, fresh.color) }),
    kind.value === 'role' ? 'Ruolo aggiunto' : 'Tag aggiunto',
  )
  if (added) fresh.name = ''
}

/** Who has a role or a tag: "2 persone", "3 convocazioni"; nothing when nobody. */
const holders = (item: { people: number; convocations?: number }) =>
  [
    item.people ? plural(item.people, 'persona', 'persone') : '',
    item.convocations ? plural(item.convocations, 'convocazione', 'convocazioni') : '',
  ].filter(Boolean)
const usage = (item: { people: number; convocations?: number }) => holders(item).join(' · ') || 'Nessuno'
</script>

<template>
  <UModal
    v-model:open="open"
    title="Ruoli e valutazione"
    description="I ruoli li scelgono le persone nella candidatura e li cambi tu; la valutazione la vedi solo tu. Un nome si salva quando esci dal campo."
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <UTabs v-model="kind" :items="kindItems" :content="false" variant="link" class="mb-4 w-full" />

      <ul class="divide-y divide-default rounded-lg border border-default">
        <template v-if="kind === 'role'">
          <li v-for="role in roles" :key="role.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
            <UInput
              v-model="names[role.id]"
              :aria-label="`Nome del ruolo ${role.name}`"
              :maxlength="60"
              :disabled="busy"
              class="min-w-0 flex-1 basis-56"
              @change="save('role', role)"
            />
            <span class="text-sm text-muted tabular-nums">{{ usage(role) }}</span>
            <UButton
              v-if="!PROTECTED_ROLES.has(role.id)"
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              :aria-label="`Elimina il ruolo ${role.name}`"
              :disabled="busy"
              @click="remove('role', role)"
            />
            <p v-else class="w-full text-sm text-muted">
              {{ PROTECTED_ROLES.get(role.id) }}: puoi rinominarlo, non eliminarlo.
            </p>
          </li>
        </template>
        <template v-else>
          <li v-for="tag in tags" :key="tag.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
            <UInput
              v-model="names[tag.id]"
              :aria-label="`Nome del tag ${tag.name}`"
              :maxlength="40"
              :disabled="busy"
              class="min-w-0 flex-1 basis-48"
              @change="save('tag', tag)"
            />
            <USelect
              :model-value="tag.color"
              :items="colorItems"
              :aria-label="`Colore del tag ${tag.name}`"
              :disabled="busy"
              class="w-32"
              @update:model-value="value => save('tag', tag, value as StaffTagColor)"
            />
            <UBadge :label="usage(tag)" :color="tag.color" variant="subtle" class="tabular-nums" />
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              :aria-label="`Elimina il tag ${tag.name}`"
              :disabled="busy"
              @click="remove('tag', tag)"
            />
          </li>
        </template>
        <li v-if="!(kind === 'role' ? roles : tags).length" class="p-4 text-muted">
          {{
            kind === 'role' ? 'Nessun ruolo: aggiungi il primo qui sotto.' : 'Nessun tag: aggiungi il primo qui sotto.'
          }}
        </li>
      </ul>

      <form class="mt-4 flex flex-wrap items-end gap-3" @submit.prevent="add">
        <UFormField :label="kind === 'role' ? 'Nuovo ruolo' : 'Nuovo tag'" class="min-w-0 flex-1 basis-56">
          <UInput
            v-model="fresh.name"
            :maxlength="kind === 'role' ? 60 : 40"
            :placeholder="kind === 'role' ? 'Es. Fotografo' : 'Es. Leader'"
            class="w-full"
          />
        </UFormField>
        <UFormField v-if="kind === 'tag'" label="Colore" class="w-32">
          <USelect v-model="fresh.color" :items="colorItems" class="w-full" />
        </UFormField>
        <UButton type="submit" icon="i-lucide-plus" label="Aggiungi" :disabled="!fresh.name.trim()" :loading="busy" />
      </form>
    </template>
  </UModal>
</template>
