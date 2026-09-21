import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabaseConfigured = Boolean(url && key)
export const supabase = supabaseConfigured ? createClient(url, key) : null

export async function signInWithDiscord() {
  if (!supabase) return { error: new Error('Supabase is not configured yet.') }

  return supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}#/verify`,
    },
  })
}

export async function getCurrentSession() {
  if (!supabase) return { data: { session: null }, error: null }
  return supabase.auth.getSession()
}

export async function submitActivisionVerification(activisionId) {
  if (!supabase) {
    return {
      data: { mock: true, activision_id: activisionId },
      error: null,
    }
  }

  return supabase.rpc('verify_player_identity', {
    p_activision_id: activisionId.trim(),
  })
}
