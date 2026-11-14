// What the scripts that write to a database share: one line of error and the administrator in whose name
// they write (created_by, imported_by, the audit), as the forms of the app do.

/** A function that prints `<script>: <message>` and exits with 1. */
export function failer(script) {
  return message => {
    console.error(`${script}: ${message}`)
    process.exit(1)
  }
}

/** The id of the active administrator with this email, inside the transaction `tx`; throws when there is none. */
export async function activeAdmin(tx, email) {
  const [admin] =
    await tx`select id from users where lower(email) = lower(${email}) and role = 'admin' and status = 'active'`
  if (!admin) throw new Error(`no active administrator with the email ${email}`)
  return admin.id
}
