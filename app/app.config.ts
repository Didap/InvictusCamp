// Nuxt UI theme (DESIGN.md). Colour names are the scales defined in assets/css/main.css.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'blu',
      secondary: 'viola',
      success: 'verde',
      info: 'azzurro',
      warning: 'giallo',
      error: 'rosso',
      neutral: 'sabbia',
    },
    button: {
      slots: { base: 'font-semibold transition-colors duration-150' },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class: 'hover:bg-(--color-blu-700) active:bg-(--color-blu-800) disabled:bg-primary aria-disabled:bg-primary',
        },
      ],
    },
    input: { slots: { base: 'pointer-coarse:min-h-11' } },
    select: { slots: { base: 'pointer-coarse:min-h-11' } },
    selectMenu: { slots: { base: 'pointer-coarse:min-h-11' } },
    formField: { slots: { label: 'font-semibold' } },
    badge: { slots: { base: 'font-semibold' } },
  },
})
