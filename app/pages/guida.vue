<script setup lang="ts">
import type { AccordionItem } from '@nuxt/ui'
import { ACCOUNT_AREA, GUIDES } from '#shared/content/guide'

// The guide of the signed-in role (docs/spec.md 3.15): what each section of the menu is for, in the order of
// the menu, the common tasks step by step and the frequent questions. It lists the role's menu as it is now, so
// staff not approved yet see only the pages they can open.
const { user } = useUserSession()
const nav = useNav()
const guide = computed(() => GUIDES[user.value?.role ?? 'family'])
const showContact = computed(() => user.value?.role !== 'admin')

const areas = computed(() => [
  ...nav.value
    .flat()
    .filter(item => item.to !== '/guida')
    .map(item => {
      const to = String(item.to)
      return { label: String(item.label), icon: String(item.icon), to, text: guide.value.areas[to] }
    }),
  ACCOUNT_AREA,
])

const howTos = computed<(AccordionItem & { steps: string[] })[]>(() =>
  guide.value.howTos.map(({ title, steps }) => ({ label: title, icon: 'i-lucide-list-ordered', steps })),
)
const faqs = computed<AccordionItem[]>(() =>
  guide.value.faqs.map(({ question, answer }) => ({ label: question, content: answer })),
)
</script>

<template>
  <IcPage title="Guida" :description="guide.intro" width="narrow">
    <IcSection title="Cosa puoi fare" description="Le sezioni del menu e a cosa serve ognuna.">
      <ul class="divide-y divide-default overflow-hidden rounded-lg border border-default bg-elevated">
        <li v-for="area in areas" :key="area.to">
          <NuxtLink
            :to="area.to"
            class="flex items-start gap-3 px-4 py-3 hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
          >
            <UIcon :name="area.icon" class="mt-0.5 size-5 shrink-0 text-primary" />
            <span class="min-w-0 flex-1">
              <span class="block font-semibold text-highlighted">{{ area.label }}</span>
              <span v-if="area.text" class="mt-0.5 block text-sm text-muted">{{ area.text }}</span>
            </span>
            <UIcon name="i-lucide-chevron-right" class="mt-0.5 size-5 shrink-0 text-dimmed" />
          </NuxtLink>
        </li>
      </ul>
    </IcSection>

    <IcSection title="Passo passo" description="Le cose da fare più spesso, un passo alla volta.">
      <UAccordion type="multiple" :items="howTos" :ui="{ label: 'text-base', trigger: 'py-3' }">
        <template #body="{ item }">
          <ol class="list-decimal space-y-2 ps-6 text-base text-default">
            <li v-for="(step, index) in item.steps" :key="index">{{ step }}</li>
          </ol>
        </template>
      </UAccordion>
    </IcSection>

    <IcSection title="Domande frequenti">
      <UAccordion
        type="multiple"
        :items="faqs"
        :ui="{ label: 'text-base', trigger: 'py-3', body: 'text-base text-default pb-4' }"
      />
    </IcSection>

    <IcSection v-if="showContact" title="Non hai trovato la risposta?">
      <IcContactLine />
    </IcSection>
  </IcPage>
</template>
