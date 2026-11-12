// Creates (or updates) the `custom:telegram` OIDC provider on the LINKED Supabase project.
// Supabase has no config.toml / Management API setting for custom providers; they live in
// the project's Auth admin API, which needs a secret (service role) key.
//
//   node scripts/setup-telegram-provider.mjs <client-id>
//
// The Telegram Client Secret is read from `telegram-client-secret.local` in the repo root
// (gitignored via *.local; the file is deleted after a successful run), or, if that file
// doesn't exist, from a hidden prompt. It is never printed or written anywhere else.
// The secret API key is fetched in memory from the Supabase CLI and never printed or stored.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(import.meta.dirname, '..')
const SECRET_FILE = resolve(ROOT, 'telegram-client-secret.local')
const IDENTIFIER = 'custom:telegram'

const clientId = process.argv[2]
if (!/^\d+$/.test(clientId ?? '')) fail('Usage: node scripts/setup-telegram-provider.mjs <numeric client id>')

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}

function npxSupabase(args) {
  // shell: true so `npx` resolves to npx.cmd on Windows. Arguments are fixed strings.
  return execFileSync('npx', ['supabase', ...args], { cwd: ROOT, shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
}

async function promptHidden(question) {
  if (!process.stdin.isTTY) fail(`No ${SECRET_FILE} and no terminal to prompt in.`)
  process.stdout.write(question)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.setEncoding('utf8')
  let value = ''
  return new Promise((done) => {
    process.stdin.on('data', (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdout.write('\n')
          return done(value)
        }
        if (ch === '\u0003') fail('Cancelled.')
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
        else value += ch
      }
    })
  })
}

// 1. Client secret (file or hidden prompt).
const fromFile = existsSync(SECRET_FILE)
const clientSecret = (fromFile ? readFileSync(SECRET_FILE, 'utf8') : await promptHidden('Telegram Client Secret (hidden): ')).trim()
if (clientSecret.length < 8) fail('The Client Secret looks empty or too short.')

// 2. Project URL + secret key, from the CLI's linked project (kept in memory only).
const linked = JSON.parse(npxSupabase(['projects', 'api-keys', '--reveal', '--output-format', 'json']))
const ref = linked.target?.project_ref
if (!ref) fail('No linked Supabase project (run `npx supabase link`).')
const keys = linked.keys ?? []
const secretKey = (keys.find((k) => k.type === 'secret') ?? keys.find((k) => k.name === 'service_role'))?.api_key
if (!secretKey) fail('Could not get a secret API key from the CLI.')
console.log(`Project: ${linked.target.project_name ?? ''} (${ref})`)

const admin = createClient(`https://${ref}.supabase.co`, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// 3. Create or update.
const settings = {
  name: 'Telegram',
  client_id: clientId,
  client_secret: clientSecret,
  issuer: 'https://oauth.telegram.org', // discovery: /.well-known/openid-configuration
  scopes: ['openid', 'profile'], // no `phone`: students are minors, we don't need it
  pkce_enabled: true,
  email_optional: true, // Telegram never shares an email
  enabled: true,
}

const existing = await admin.auth.admin.customProviders.getProvider(IDENTIFIER)
const result = existing.data
  ? await admin.auth.admin.customProviders.updateProvider(IDENTIFIER, settings)
  : await admin.auth.admin.customProviders.createProvider({ provider_type: 'oidc', identifier: IDENTIFIER, ...settings })
if (result.error) fail(`${existing.data ? 'Update' : 'Create'} failed: ${result.error.message}`)

const p = result.data
console.log(`✓ ${existing.data ? 'Updated' : 'Created'} ${p.identifier}`)
console.log(`  enabled=${p.enabled} email_optional=${p.email_optional} pkce=${p.pkce_enabled} scopes=${(p.scopes ?? []).join(' ')}`)
console.log(`  client_id=${p.client_id} issuer=${p.issuer ?? p.discovery_document?.issuer ?? '?'}`)
console.log(`  discovery: ${p.discovery_document ? `ok (auth endpoint ${p.discovery_document.authorization_endpoint})` : 'not fetched yet'}`)

if (fromFile) {
  rmSync(SECRET_FILE)
  console.log(`  Deleted ${SECRET_FILE} (the secret now lives only in Supabase).`)
}
