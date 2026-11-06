import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://invictuscamp:invictuscamp@localhost:5436/invictuscamp',
  },
  casing: 'snake_case',
  strict: true,
})
