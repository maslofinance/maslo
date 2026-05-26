import { createClient } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import type { Database } from './database.types'

// Returns a service-role client that bypasses RLS.
// Use ONLY in app/api/* routes — never in client components.
// Required for reading plaid_access_token and running vault logic.
export function createServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase server env vars')
  return createClient<Database>(url, key, { auth: { persistSession: false } })
}

// Extract and verify the user from the Authorization: Bearer <jwt> header.
// The service-role client can validate any JWT against the auth service.
export async function getRequestUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return null
  const supabase = createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  return user
}
