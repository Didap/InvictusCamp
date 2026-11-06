// Stored files: bytes on the filesystem under the uploads directory, metadata in `files`. Never served
// from a public URL: downloads go through GET /api/files/:id (or an area endpoint) after an access check.
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { eq } from 'drizzle-orm'
import type { FilePurpose, UploadMimeType } from '../../shared/utils/constants'
import { files } from '../db/schema'
import { sha256 } from './crypto'
import type { DbOrTx } from './db'

export type FileRow = typeof files.$inferSelect

const EXTENSIONS: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
}

/** The type of a file from its first bytes, never from its name or from what the browser claims. */
export function sniffMimeType(data: Uint8Array): UploadMimeType | null {
  const startsWith = (...bytes: number[]) => bytes.every((byte, i) => data[i] === byte)
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf' // %PDF-
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg'
  return null
}

/** A file name safe for the database and for Content-Disposition. */
export function cleanName(name: string): string {
  const cleaned = name
    .replace(/[\\/\r\n"<>:|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
  return cleaned || 'documento'
}

function absolutePath(uploadsDir: string, storageKey: string): string {
  const root = resolve(uploadsDir)
  const full = resolve(root, storageKey)
  if (!full.startsWith(root + sep)) throw new Error('Invalid storage key')
  return full
}

export interface StoreFileInput {
  data: Uint8Array
  originalName: string
  mimeType: string
  purpose: FilePurpose
  /** Whose data this is; null for documents of the administration. */
  ownerUserId?: string | null
  uploadedBy?: string | null
}

/** Writes the bytes under <uploadsDir>/YYYY/MM/<uuid>.<ext> and records them in `files`. */
export async function storeFile(db: DbOrTx, uploadsDir: string, input: StoreFileInput): Promise<FileRow> {
  const now = new Date()
  const extension = EXTENSIONS[input.mimeType] ?? extname(input.originalName).toLowerCase().slice(0, 8)
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const storageKey = `${now.getUTCFullYear()}/${month}/${randomUUID()}${extension}`
  const path = absolutePath(uploadsDir, storageKey)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, input.data)
  const [row] = await db
    .insert(files)
    .values({
      storageKey,
      originalName: cleanName(input.originalName),
      mimeType: input.mimeType,
      sizeBytes: input.data.byteLength,
      sha256: sha256(input.data),
      purpose: input.purpose,
      ownerUserId: input.ownerUserId ?? null,
      uploadedBy: input.uploadedBy ?? null,
    })
    .returning()
  return row!
}

export async function readStoredFile(uploadsDir: string, file: Pick<FileRow, 'storageKey'>): Promise<Buffer> {
  return readFile(absolutePath(uploadsDir, file.storageKey))
}

/** Removes the record and the bytes. */
export async function deleteStoredFile(db: DbOrTx, uploadsDir: string, fileId: string): Promise<void> {
  const [row] = await db.delete(files).where(eq(files.id, fileId)).returning({ storageKey: files.storageKey })
  if (row) await removeStoredBytes(uploadsDir, [row.storageKey])
}

/** Removes the bytes of files whose records are gone (after the transaction that deleted them). */
export async function removeStoredBytes(uploadsDir: string, storageKeys: string[]): Promise<void> {
  await Promise.all(storageKeys.map(key => rm(absolutePath(uploadsDir, key), { force: true })))
}
