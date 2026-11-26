<script setup lang="ts">
import { GUIDES } from '#shared/content/guide'
import { guidePages } from '#shared/utils/nav'

// The guide of the signed-in role (docs/spec.md 3.15): what each section of the menu is for, in the order of
// the menu, the common tasks step by step and the frequent questions. It lists the role's menu as it is now, so
// staff not approved yet see only the pages they can open.
const { user } = useUserSession()
const nav = useNav()
const guide = computed(() => GUIDES[user.value?.role ?? 'family'])
const showContact = computed(() => showsContact(user.value?.role))

const areas = computed(() =>
  guidePages(nav.value).map(item => ({ ...item, key: item.to, detail: guide.value.areas[item.to] })),
)

const howTos = computed(() =>
  guide.value.howTos.map(({ title, steps }) => ({ label: title, icon: 'i-lucide-list-ordered', steps })),
)
const faqs = computed(() => guide.value.faqs.map(({ question, answer }) => ({ label: question, content: answer })))
</script>

<template>
  <IcPage title="Guida" :description="guide.intro" width="narrow">
    <IcSection title="Cosa puoi fare" description="Le sezioni del menu e a cosa serve ognuna.">
      <DashboardTodoList :items="areas" />
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
