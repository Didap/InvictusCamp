<script setup lang="ts">
import { CONTACT_IMPORT_MAX, type ContactImportInput } from '#shared/schemas/contacts'
import type { ContactImportResult } from '#shared/types/contacts'
import { type ContactKind, enumLabel } from '#shared/utils/constants'
import { parseContacts } from '#shared/utils/contacts-import'
import { plural } from '#shared/utils/format'

// The bulk import of the «Anagrafica» (spec 3.16): a list pasted from a spreadsheet or loaded from a CSV is read
// here, in the browser (shared/utils/contacts-import.ts), shown before it is saved, then sent in one request.
// An email already in the registry is not added twice. No email leaves.
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()

const api = useApi()
const { options } = useEnums()
const kindItems = options('contactKind').map(({ value, label, icon }) => ({ value, label, icon }))

/** A CSV bigger than this is not a list of a few thousand contacts. */
const MAX_FILE_BYTES = 2_000_000
const PREVIEW_ROWS = 5
const SHOWN_PROBLEMS = 20

const text = ref('')
const fileName = ref('')
const fileError = ref('')
const kind = ref<ContactKind>()
const groupIds = ref<string[]>([])
const update = ref(false)
const importing = ref(false)
watch(open, value => {
  if (!value) return
  text.value = ''
  fileName.value = ''
  fileError.value = ''
  kind.value = undefined
  groupIds.value = []
  update.value = false
})

const parsed = computed(() => parseContacts(text.value))
const contacts = computed(() => parsed.value.contacts)
const withoutKind = computed(() => contacts.value.filter(contact => !contact.kind).length)
const tooMany = computed(() => contacts.value.length > CONTACT_IMPORT_MAX)
const ready = computed(() => contacts.value.length > 0 && !tooMany.value && (!withoutKind.value || Boolean(kind.value)))

/** A CSV from Excel in Italian may be in Windows-1252: read as UTF-8 when it is, else as that. */
async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  fileError.value = ''
  if (file.size > MAX_FILE_BYTES) {
    fileError.value = `Il file è troppo grande: dividi l’elenco in parti da al massimo ${CONTACT_IMPORT_MAX} righe.`
    return
  }
  const bytes = await file.arrayBuffer()
  try {
    text.value = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    text.value = new TextDecoder('windows-1252').decode(bytes)
  }
  fileName.value = file.name
}

async function onImport() {
  if (!ready.value) return
  importing.value = true
  try {
    const body: ContactImportInput = {
      rows: contacts.value.map(({ firstName, lastName, email, kind: rowKind }) => ({
        firstName,
        lastName,
        email,
        kind: rowKind,
      })),
      kind: kind.value ?? 'other',
      groupIds: groupIds.value,
      update: update.value,
    }
    const result = await api<ContactImportResult>('/api/admin/contacts/import', { method: 'POST', body })
    const existing = result.existing
      ? `${plural(result.existing, 'era già', 'erano già')} in anagrafica${
          result.updated ? `, ${plural(result.updated, 'aggiornato', 'aggiornati')}` : ''
        }.`
      : undefined
    notifySuccess(plural(result.created, 'contatto aggiunto', 'contatti aggiunti'), existing)
    emit('imported')
    open.value = false
  } catch (error) {
    notifyError(error, 'Importazione non riuscita')
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Importa un elenco"
    description="Incolla le righe o scegli un file CSV: prima di salvare vedi cosa entra. Non parte nessuna email."
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-5">
        <UFormField
          label="Elenco"
          help="Da Excel o Google Fogli: seleziona le colonne (nome, cognome, email, tipo) e incollale qui. Con la riga dei titoli le colonne si riconoscono da sole; senza, conta solo che l’email abbia la @."
        >
          <UTextarea
            v-model="text"
            :rows="8"
            autoresize
            :maxrows="14"
            placeholder="Nome;Cognome;Email;Tipo&#10;Mario;Rossi;mario.rossi@example.it;Famiglia"
            class="w-full font-mono text-sm"
          />
        </UFormField>
        <div class="flex flex-wrap items-center gap-3">
          <UButton as="label" icon="i-lucide-file-up" color="neutral" variant="outline" class="cursor-pointer">
            Scegli un file CSV
            <input type="file" accept=".csv,.txt,text/csv,text/plain" class="sr-only" @change="onFile" />
          </UButton>
          <span v-if="fileName" class="text-sm text-muted">{{ fileName }}</span>
          <p v-if="fileError" class="w-full text-sm text-error" role="alert">{{ fileError }}</p>
        </div>

        <template v-if="text.trim()">
          <p class="font-semibold text-highlighted" aria-live="polite">
            {{ plural(contacts.length, 'contatto pronto', 'contatti pronti') }}
            <span v-if="parsed.problems.length" class="font-normal text-muted">
              · {{ plural(parsed.problems.length, 'riga lasciata fuori', 'righe lasciate fuori') }}
            </span>
          </p>

          <UAlert
            v-if="tooMany"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="`Al massimo ${CONTACT_IMPORT_MAX} contatti alla volta: dividi l’elenco.`"
          />

          <div v-if="contacts.length" class="overflow-x-auto rounded-lg border border-default">
            <table class="w-full text-sm">
              <caption class="sr-only">
                Le prime righe dell’elenco
              </caption>
              <thead class="bg-muted text-left">
                <tr>
                  <th scope="col" class="px-3 py-2 font-semibold">Nome</th>
                  <th scope="col" class="px-3 py-2 font-semibold">Cognome</th>
                  <th scope="col" class="px-3 py-2 font-semibold">Email</th>
                  <th scope="col" class="px-3 py-2 font-semibold">Tipo</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr v-for="contact in contacts.slice(0, PREVIEW_ROWS)" :key="contact.line">
                  <td class="px-3 py-2">{{ contact.firstName || '·' }}</td>
                  <td class="px-3 py-2">{{ contact.lastName || '·' }}</td>
                  <td class="px-3 py-2 break-all">{{ contact.email }}</td>
                  <td class="px-3 py-2 text-muted">
                    {{ contact.kind ? enumLabel('contactKind', contact.kind) : 'Da scegliere' }}
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="contacts.length > PREVIEW_ROWS" class="border-t border-default px-3 py-2 text-sm text-muted">
              e altri {{ contacts.length - PREVIEW_ROWS }}
            </p>
          </div>

          <UAlert
            v-if="parsed.problems.length"
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="plural(parsed.problems.length, 'riga resta fuori', 'righe restano fuori')"
          >
            <template #description>
              <p>Correggi l’elenco e incollalo di nuovo, oppure aggiungi questi contatti a mano dopo.</p>
              <ul class="mt-1 space-y-0.5">
                <li v-for="problem in parsed.problems.slice(0, SHOWN_PROBLEMS)" :key="problem.line">
                  Riga {{ problem.line }}: {{ problem.reason }}
                </li>
                <li v-if="parsed.problems.length > SHOWN_PROBLEMS">
                  e altre {{ parsed.problems.length - SHOWN_PROBLEMS }}
                </li>
              </ul>
            </template>
          </UAlert>

          <div v-if="contacts.length" class="grid gap-5 sm:grid-cols-2">
            <UFormField
              v-if="withoutKind"
              label="Tipo"
              required
              :help="
                withoutKind === contacts.length
                  ? 'Per tutti i contatti dell’elenco.'
                  : withoutKind === 1
                    ? 'Per il contatto senza un tipo nell’elenco.'
                    : `Per i ${withoutKind} senza un tipo nell’elenco.`
              "
            >
              <USelect v-model="kind" :items="kindItems" placeholder="Scegli il tipo" class="w-full" />
            </UFormField>
            <UFormField label="Gruppi" hint="Facoltativo" help="Tutti i contatti dell’elenco entrano in questi gruppi.">
              <ContactsGroupSelect v-model="groupIds" aria-label="Gruppi dei contatti importati" />
            </UFormField>
          </div>
          <UCheckbox
            v-if="contacts.length"
            v-model="update"
            label="Aggiorna i contatti già in anagrafica"
            description="Prendono tipo, nome e cognome dell’elenco (una cella vuota non cancella niente). Altrimenti restano come sono."
          />
        </template>

        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <UButton color="neutral" variant="outline" label="Annulla" @click="open = false" />
          <UButton
            icon="i-lucide-upload"
            :label="contacts.length ? `Importa ${plural(contacts.length, 'contatto', 'contatti')}` : 'Importa'"
            :disabled="!ready"
            :loading="importing"
            @click="onImport"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
