<script setup lang="ts">
import { z } from 'zod'
import { accountSchema, changePasswordSchema } from '#shared/schemas/auth'
import type { AccountDto } from '#shared/types/api'
import { formatDateTime } from '#shared/utils/format'

const api = useApi()
const { fetch: refreshSession } = useUserSession()
const { data: account, refresh } = await useApiFetch<AccountDto>('/api/account')

const profile = reactive({ firstName: '', lastName: '', phone: '' })
watchEffect(() => {
  if (!account.value) return
  profile.firstName = account.value.firstName
  profile.lastName = account.value.lastName
  profile.phone = account.value.phone ?? ''
})
const savingProfile = ref(false)

async function saveProfile() {
  savingProfile.value = true
  try {
    await api('/api/account', { method: 'PATCH', body: { ...profile, phone: profile.phone || null } })
    await Promise.all([refresh(), refreshSession()])
    notifySuccess('Dati salvati')
  } catch (error) {
    notifyError(error)
  } finally {
    savingProfile.value = false
  }
}

const passwordSchema = changePasswordSchema
  .extend({ confirm: z.string() })
  .refine(value => value.newPassword === value.confirm, { path: ['confirm'], error: 'Le due password non coincidono' })
const passwords = reactive({ currentPassword: '', newPassword: '', confirm: '' })
const savingPassword = ref(false)

async function savePassword() {
  savingPassword.value = true
  try {
    await api('/api/account/password', {
      method: 'PUT',
      body: { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword },
    })
    Object.assign(passwords, { currentPassword: '', newPassword: '', confirm: '' })
    notifySuccess('Password aggiornata', 'Le sessioni aperte su altri dispositivi sono state chiuse.')
  } catch (error) {
    notifyError(error)
  } finally {
    savingPassword.value = false
  }
}
</script>

<template>
  <IcPage title="Il mio account" width="narrow">
    <IcSection title="Dati personali" :description="account ? `Email: ${account.email}` : undefined">
      <UForm :schema="accountSchema" :state="profile" class="max-w-xl space-y-5" @submit="saveProfile">
        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Nome" name="firstName" required>
            <UInput v-model="profile.firstName" autocomplete="given-name" class="w-full" />
          </UFormField>
          <UFormField label="Cognome" name="lastName" required>
            <UInput v-model="profile.lastName" autocomplete="family-name" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Telefono" name="phone" hint="Facoltativo">
          <UInput v-model="profile.phone" type="tel" autocomplete="tel" class="w-full" />
        </UFormField>
        <UButton type="submit" :loading="savingProfile" label="Salva" />
      </UForm>
      <p v-if="account?.lastLoginAt" class="mt-6 text-sm text-muted">
        Ultimo accesso: {{ formatDateTime(account.lastLoginAt) }}
      </p>
    </IcSection>

    <IcSection title="Password" description="Cambiandola, le sessioni aperte su altri dispositivi si chiudono.">
      <UForm :schema="passwordSchema" :state="passwords" class="max-w-xl space-y-5" @submit="savePassword">
        <UFormField label="Password attuale" name="currentPassword" required>
          <IcPasswordInput v-model="passwords.currentPassword" autocomplete="current-password" />
        </UFormField>
        <UFormField label="Nuova password" name="newPassword" help="Almeno 10 caratteri." required>
          <IcPasswordInput v-model="passwords.newPassword" autocomplete="new-password" />
        </UFormField>
        <UFormField label="Ripeti la nuova password" name="confirm" required>
          <IcPasswordInput v-model="passwords.confirm" autocomplete="new-password" />
        </UFormField>
        <UButton type="submit" :loading="savingPassword" label="Cambia password" />
      </UForm>
    </IcSection>
  </IcPage>
</template>
