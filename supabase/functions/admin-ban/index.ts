// admin-ban: ban or unban a student.
//
//   POST { user_id: string, banned: boolean, reason?: string }
//   Authorization: Bearer <the ADMIN's access token>
//
// 1. Calls public.admin_set_ban() WITH THE CALLER'S TOKEN, so Postgres checks is_admin(),
//    validates the reason, sets profiles.is_banned, closes open attempts and audits it.
//    A non-admin is rejected there and nothing else happens.
// 2. Then bans / unbans the auth user with the service role key (blocks sign-in and token
//    refresh). The service role key exists ONLY here, never in frontend code.
//
// The database ban is authoritative (every RPC checks profiles.is_banned), so if step 2 fails
// the student is still blocked; the response says so and the admin can retry.

import { createClient } from 'npm:@supabase/supabase-js@2.119.0'

const BAN_DURATION = '876000h' // ~100 years; 'none' lifts it

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) return json(500, { error: 'Function is not configured' })

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'Not signed in' })

  let body: { user_id?: unknown; banned?: unknown; reason?: unknown }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }
  const userId = typeof body.user_id === 'string' ? body.user_id : ''
  const banned = body.banned
  const reason = typeof body.reason === 'string' ? body.reason : null
  if (!UUID.test(userId) || typeof banned !== 'boolean') {
    return json(400, { error: 'Expected { user_id: uuid, banned: boolean, reason?: string }' })
  }

  // Caller identity (the gateway's JWT check is off for this function; we verify here).
  const asCaller = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: who, error: whoError } = await asCaller.auth.getUser(token)
  if (whoError || !who.user) return json(401, { error: 'Not signed in' })

  // 1. Database (authoritative; checks admin rights).
  const { data: dbResult, error: dbError } = await asCaller.rpc('admin_set_ban', {
    p_user_id: userId,
    p_banned: banned,
    p_reason: reason,
  })
  if (dbError) {
    const status = dbError.code === '42501' ? 403 : dbError.code === 'P0002' ? 404 : 400
    return json(status, { error: dbError.message, code: dbError.code })
  }

  // 2. Auth user (service role, server-side only).
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? BAN_DURATION : 'none',
  })
  if (authError) {
    return json(502, {
      error: `The profile was ${banned ? 'banned' : 'unbanned'}, but the sign-in ${banned ? 'block' : 'unblock'} failed: ${authError.message}. Try again.`,
      db: dbResult,
      auth_synced: false,
    })
  }

  return json(200, { ...((dbResult ?? {}) as Record<string, unknown>), auth_synced: true })
})
