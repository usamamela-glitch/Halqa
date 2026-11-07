// Email + password sign-in (Supabase Auth). Each device signs in once and
// stays signed in, offline too. Accounts are created by Usama in the Supabase
// dashboard; sign-ups from the app are switched off.
import { useEffect, useState } from 'react'
import { supabase, AUTH_STORAGE_KEY } from './supabase'
import { db } from './db'
import { API_KEY_STORAGE } from './analysis'

// Signed in = a saved session on this device. Checked locally so Halqa opens
// offline even when the short-lived access token has expired; it is refreshed
// as soon as there is signal.
export function hasSavedSession() {
  try { return !!localStorage.getItem(AUTH_STORAGE_KEY) } catch { return false }
}

export function useSignedIn() {
  const [signedIn, setSignedIn] = useState(null)
  useEffect(() => {
    setSignedIn(hasSavedSession())
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') setSignedIn(false)
      else if (session) setSignedIn(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])
  return signedIn
}

export function useAccountEmail() {
  const [email, setEmail] = useState('')
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null')
      setEmail(saved?.user?.email || '')
    } catch { /* not signed in */ }
  }, [])
  return email
}

export async function signIn(email, password) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'No internet connection. Signing in needs signal the first time.'
  }
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (!error) return null
  if (/invalid login credentials/i.test(error.message)) return 'Wrong email or password.'
  if (/fetch|network|load failed/i.test(error.message)) return 'Couldn’t reach the server. Check the connection and try again.'
  return error.message
}

// Signs out and removes Halqa's data and API key from this device. Everything
// stays in the database; signing in again downloads it.
export async function signOutAndClear() {
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.removeItem(API_KEY_STORAGE)
  } catch { /* storage blocked */ }
  db.close()
  await db.delete().catch(() => {})
  window.location.replace('/')
}
