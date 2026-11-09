<template>
  <!-- Public pages: sign-in, registration, application, password, invitation. -->
  <div class="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
    <aside class="hidden flex-col justify-between border-e border-default bg-elevated p-12 lg:flex">
      <IcLogo size="lg" :subtitle="false" />
      <div class="max-w-sm">
        <p class="text-3xl leading-tight font-bold text-highlighted">Il gestionale di Invictus Camp</p>
        <p class="mt-4 text-lg text-muted">
          Sessioni, famiglie, staff e documenti in un unico posto, per un camp dove ogni famiglia è accolta.
        </p>
      </div>
      <div class="space-y-4">
        <IcBrandStripe />
        <p class="text-sm text-muted">Invictus Camp · Maruggio (TA), Puglia</p>
      </div>
    </aside>
    <main class="flex items-start justify-center px-5 py-10 sm:items-center sm:px-10">
      <div class="w-full max-w-md">
        <IcLogo class="mb-10 lg:hidden" :subtitle="false" />
        <slot />
      </div>
    </main>
  </div>
</template>
