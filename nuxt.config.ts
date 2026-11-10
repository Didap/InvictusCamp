// Invictus Camp, gestionale interno. Every page sits behind a login, so the app is a SPA (ssr: false):
// Nitro serves the API and the HTML shell. See CLAUDE.md for the stack and the rules.
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',

  ssr: false,

  modules: ['@nuxt/ui', '@vueuse/nuxt', 'nuxt-auth-utils'],

  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      htmlAttrs: { lang: 'it' },
      title: 'Invictus Camp',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        {
          name: 'description',
          content: 'Gestionale di Invictus Camp: sessioni, famiglie, staff, documenti e comunicazioni.',
        },
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'theme-color', content: '#fcf9ef' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },

  devServer: { port: 3080 },

  runtimeConfig: {
    databaseUrl: '',
    /** Public address of the app: links in emails point here. */
    appUrl: 'http://localhost:3080',
    /** Without a key emails are not sent: they are recorded in email_log as "simulated". */
    resendApiKey: '',
    emailFrom: 'Invictus Camp <noreply@invictuscamp.it>',
    emailReplyTo: '',
    /** Uploaded files live on the filesystem (a persistent volume in production). */
    uploadsDir: './.data/uploads',
    /** First administration account of a new installation (server/plugins/first-admin.ts). */
    firstAdmin: { email: '', password: '' },
    session: {
      name: 'invictus-session',
      maxAge: 60 * 60 * 24 * 14,
    },
    public: {
      /** How families and staff reach the camp (<IcContactLine>): only the values that are set appear. */
      contact: {
        email: 'info@fondazionevannilongo.it',
        phone: '',
        hours: '',
      },
    },
  },

  routeRules: {
    '/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'X-Frame-Options': 'SAMEORIGIN',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      },
    },
  },

  ui: {
    colorMode: false,
    theme: {
      colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'],
    },
  },

  fonts: {
    families: [
      {
        name: 'Atkinson Hyperlegible Next',
        provider: 'google',
        weights: ['200 800'],
        styles: ['normal', 'italic'],
      },
      { name: 'Atkinson Hyperlegible Mono', provider: 'google', weights: [400, 500, 600], styles: ['normal'] },
    ],
  },

  icon: {
    serverBundle: { collections: ['lucide'] },
    clientBundle: { scan: true },
  },

  typescript: { strict: true },
})
