import { createClient } from '@supabase/supabase-js'

const fallbackUrl = 'https://ybjqoizoiyuefvoinfor.supabase.co'
const fallbackKey = 'sb_publishable_hfYcAAMx7Q2KS2UcHFtIqQ_LFw0LNpJ'

const url = import.meta.env.VITE_SUPABASE_URL || fallbackUrl
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || fallbackKey

export const supabaseConfigured = Boolean(url && key)
export const supabase = supabaseConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export async function signInWithDiscord(next = '/staff') {
  if (!supabase) return { error: new Error('Sign-in is not configured yet.') }

  return supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo: `${window.location.origin}${next}`,
    },
  })
}

export async function signOut() {
  if (!supabase) return { error: null }
  return supabase.auth.signOut()
}

export async function getCurrentSession() {
  if (!supabase) return { data: { session: null }, error: null }
  return supabase.auth.getSession()
}

export function onAuthStateChange(callback) {
  if (!supabase) return { data: { subscription: { unsubscribe() {} } } }
  return supabase.auth.onAuthStateChange(callback)
}
