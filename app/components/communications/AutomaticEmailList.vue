<script setup lang="ts">
import type { AutomaticEmailState, AutomaticEmailSwitch } from '#shared/types/automatic-emails'
import {
  AUTOMATIC_EMAIL_AREA_LABELS,
  AUTOMATIC_EMAIL_AREAS,
  automaticEmailDefinition,
  type AutomaticEmailKey,
} from '#shared/utils/automatic-emails'
import { plural } from '#shared/utils/format'

// Comunicazioni › Automatiche: every email the platform sends by itself, by area, with what makes it leave
// and its switch. Off, its event no longer sends it; the page of each email changes its texts.
const api = useApi()
const confirm = useConfirm()

const { data: states, refresh } = await useApiFetch<AutomaticEmailState[]>('/api/admin/automatic-emails')

const groups = computed(() =>
  AUTOMATIC_EMAIL_AREAS.map(area => ({
    area,
    label: AUTOMATIC_EMAIL_AREA_LABELS[area],
    emails: (states.value ?? [])
      .map(state => ({ ...state, ...automaticEmailDefinition(state.key) }))
      .filter(email => email.area === area),
  })).filter(group => group.emails.length),
)

const switching = ref<AutomaticEmailKey | null>(null)

async function setActive(key: AutomaticEmailKey, active: boolean) {
  const email = automaticEmailDefinition(key)
  if (!active) {
    const ok = await confirm({
      title: `Spegni «${email.label}»?`,
      description: `${email.trigger} Da adesso non parte più: nel registro la trovi come «Spenta».${email.manual ? ' Puoi sempre mandarla a mano dalla sua pagina.' : ''} Nessuna email parte adesso.`,
      confirmLabel: 'Spegni l’email',
    })
    if (!ok) return
  }
  switching.value = key
  try {
    const url: string = `/api/admin/automatic-emails/${key}/active`
    const { held } = await api<AutomaticEmailSwitch>(url, { method: 'PUT', body: { active } })
    await refresh()
    notifySuccess(
      active ? `«${email.label}» è accesa` : `«${email.label}» è spenta`,
      held ? `${plural(held, 'email in coda non partirà', 'email in coda non partiranno')}.` : undefined,
    )
  } catch (error) {
    notifyError(error)
  } finally {
    switching.value = null
  }
}
</script>

<template>
  <div class="space-y-8">
    <p class="max-w-prose text-muted">
      Le email che il gestionale manda da solo quando succede qualcosa. Puoi cambiarne il testo e spegnerle: una email
      spenta non parte più, ma alcune puoi mandarle a mano quando vuoi.
    </p>

    <section v-for="group in groups" :key="group.area" :aria-labelledby="`automatiche-${group.area}`">
      <h2 :id="`automatiche-${group.area}`" class="mb-3 text-lg font-semibold text-highlighted">
        {{ group.label }}
      </h2>
      <ul class="divide-y divide-default rounded-lg border border-default bg-default">
        <li
          v-for="email in group.emails"
          :key="email.key"
          class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <NuxtLink
                :to="`/admin/comunicazioni/automatiche/${email.key}`"
                class="font-semibold text-highlighted underline-offset-4 hover:underline focus-visible:underline"
              >
                {{ email.label }}
              </NuxtLink>
              <UBadge v-if="email.customized" label="Testo modificato" color="neutral" variant="subtle" size="sm" />
              <UBadge v-if="!email.active" label="Spenta" color="warning" variant="subtle" size="sm" />
            </div>
            <p class="mt-1 text-sm text-muted">{{ email.trigger }}</p>
            <p class="mt-1 text-sm text-muted">A chi: {{ email.recipient }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-3">
            <p v-if="email.alwaysOn" class="flex items-center gap-1.5 text-sm text-muted" :title="email.alwaysOn">
              <UIcon name="i-lucide-lock" class="size-4" aria-hidden="true" />
              Sempre attiva
            </p>
            <USwitch
              v-else
              :model-value="email.active"
              label="Attiva"
              :loading="switching === email.key"
              :disabled="switching !== null"
              @update:model-value="value => setActive(email.key, value)"
            />
            <UButton
              :to="`/admin/comunicazioni/automatiche/${email.key}`"
              label="Apri"
              trailing-icon="i-lucide-chevron-right"
              color="neutral"
              variant="ghost"
              :aria-label="`Apri «${email.label}»`"
            />
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
