<script setup lang="ts">
import {
  RELEASE_FIELDS_HELP,
  RELEASE_TEXT_MAX,
  releaseFieldIssue,
  releaseText,
  SAMPLE_RELEASE_INPUT,
} from '#shared/content/release'
import { releaseTextSaveSchema, type ReleaseTextSaveInput } from '#shared/schemas/releases'
import type { ReleaseRenewResult, ReleaseTextDto } from '#shared/types/families'
import { plural } from '#shared/utils/format'

// The editor of the family release (docs/spec.md 3.8): the text with its fields, a preview filled with an
// example family, and the releases in force written with another text, whose families can be asked to sign
// again. Salva sends the text with the revision it was loaded at: if someone saved in between, the server
// refuses (409). `saved` hands the new state to the page.
const props = defineProps<{ release: ReleaseTextDto }>()
const emit = defineEmits<{ saved: [release: ReleaseTextDto] }>()

const api = useApi()
const confirm = useConfirm()
const toast = useToast()

const body = ref(props.release.body)
const reset = () => (body.value = props.release.body)
// A new saved text replaces the draft only where nothing was typed since the last one: what was written
// while a save was on its way stays.
watch(
  () => props.release.body,
  (saved, before) => {
    if (body.value.trim() === before) body.value = saved
  },
)
const dirty = computed(() => body.value.trim() !== props.release.body)
const fieldIssue = computed(() => releaseFieldIssue(body.value) ?? undefined)
const preview = computed(() => releaseText(body.value, SAMPLE_RELEASE_INPUT))
const outdatedSummary = computed(() => {
  const { inForce, outdated, outdatedSigned } = props.release
  const signed = outdatedSigned ? ` (${plural(outdatedSigned, 'già firmata', 'già firmate')})` : ''
  return `${outdated} di ${plural(inForce, 'liberatoria', 'liberatorie')} in vigore ${outdated === 1 ? 'ha' : 'hanno'} un testo di prima${signed}. Si rifanno con questo testo alla prossima modifica dei dati della famiglia, oppure subito con il pulsante.`
})

const saving = ref(false)
async function onSave() {
  const input: ReleaseTextSaveInput = { revision: props.release.revision, body: body.value }
  const check = releaseTextSaveSchema.safeParse(input)
  if (!check.success) {
    toast.add({
      title: 'Testo non salvato',
      description: check.error.issues[0]!.message,
      color: 'error',
      icon: 'i-lucide-circle-alert',
    })
    return
  }
  saving.value = true
  try {
    const release = await api<ReleaseTextDto>('/api/admin/release-text', { method: 'PUT', body: input })
    emit('saved', release)
    notifySuccess(
      'Testo salvato',
      'Le nuove liberatorie usano già questo testo.' +
        (release.outdated ? ' Sotto trovi quelle con il testo di prima.' : ''),
    )
  } catch (error) {
    notifyError(error, 'Testo non salvato')
  } finally {
    saving.value = false
  }
}

const renewing = ref(false)
async function renew() {
  const { outdated, outdatedSigned } = props.release
  const signed = outdatedSigned
    ? `, anche per ${plural(outdatedSigned, 'famiglia che l’aveva già firmata', 'famiglie che l’avevano già firmata')}`
    : ''
  const ok = await confirm({
    title: 'Chiedere di nuovo la firma?',
    description: `${plural(outdated, 'famiglia riceve', 'famiglie ricevono')} la liberatoria con questo testo e un’email per firmarla: partono ${outdated} email. La liberatoria di prima viene archiviata${signed}.`,
    confirmLabel: 'Chiedi la firma',
    cancelLabel: 'Annulla',
  })
  if (!ok) return
  renewing.value = true
  try {
    const result = await api<ReleaseRenewResult>('/api/admin/release-text/renew', {
      method: 'POST',
      body: { revision: props.release.revision },
    })
    emit('saved', result.release)
    notifySuccess(
      'Firma richiesta',
      `${plural(result.renewed, 'liberatoria rifatta', 'liberatorie rifatte')} con questo testo.`,
    )
  } catch (error) {
    notifyError(error, 'Firma non richiesta')
  } finally {
    renewing.value = false
  }
}

useLeaveGuard(dirty, 'al testo della liberatoria')
</script>

<template>
  <div>
    <IcSaveBar
      :dirty="dirty"
      :saving="saving"
      :updated-at="release.updatedAt"
      :updated-by-name="release.updatedByName"
      never-saved="Il testo di esempio del gestionale, mai modificato"
      discard-description="Il testo torna com’era all’ultimo salvataggio."
      @save="onSave"
      @discard="reset"
    />

    <UAlert
      v-if="!release.revision"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="Testo di esempio"
      description="Le famiglie firmano questa bozza finché non salvi il testo del camp."
      class="mb-8"
    />

    <IcSection
      title="Testo"
      description="La famiglia lo firma in Documenti quando ha confermato i dati e completato le schede. Non riporta dati sulla salute."
    >
      <UFormField label="Testo della liberatoria" name="body" :help="RELEASE_FIELDS_HELP" :error="fieldIssue" required>
        <UTextarea v-model="body" :rows="16" :maxlength="RELEASE_TEXT_MAX" autoresize class="w-full" />
      </UFormField>
    </IcSection>

    <IcSection title="Anteprima" description="Il testo compilato con una famiglia di esempio, come arriva nel PDF.">
      <article class="rounded-lg border border-default bg-elevated p-4 sm:p-5">
        <h3 class="font-bold text-highlighted">{{ preview.title }}</h3>
        <p v-for="(paragraph, i) in preview.paragraphs" :key="i" class="mt-3 text-sm whitespace-pre-line">
          {{ paragraph }}
        </p>
      </article>
    </IcSection>

    <IcSection title="Liberatorie in vigore">
      <p v-if="!release.inForce" class="text-sm text-muted">
        Nessuna famiglia ha ancora una liberatoria: il gestionale la prepara quando la famiglia completa dati e schede.
      </p>
      <p v-else-if="!release.outdated" class="text-sm">
        {{ plural(release.inForce, 'liberatoria in vigore', 'liberatorie in vigore') }}, tutte con questo testo.
      </p>
      <template v-else>
        <p class="text-sm">{{ outdatedSummary }}</p>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <UButton
            icon="i-lucide-pen-line"
            color="neutral"
            variant="outline"
            :loading="renewing"
            :disabled="dirty"
            @click="renew"
          >
            Chiedi la firma sul nuovo testo
          </UButton>
          <span v-if="dirty" class="text-sm text-muted">Prima salva il testo.</span>
        </div>
      </template>
    </IcSection>
  </div>
</template>
