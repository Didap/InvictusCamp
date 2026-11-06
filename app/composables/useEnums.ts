import { ENUM_META, enumLabel, enumMeta, type EnumMeta, type EnumName } from '#shared/utils/constants'

export interface EnumOption {
  value: string
  label: string
  icon: string
  description?: string
}

/** Labels, icons and select options of the fixed enumerations (shared/utils/constants.ts). */
export function useEnums() {
  function options(name: EnumName, only?: readonly string[]): EnumOption[] {
    return (Object.entries(ENUM_META[name]) as [string, EnumMeta][])
      .filter(([value]) => !only || only.includes(value))
      .map(([value, meta]) => ({ value, label: meta.label, icon: meta.icon, description: meta.description }))
  }
  return { meta: enumMeta, label: enumLabel, options }
}
