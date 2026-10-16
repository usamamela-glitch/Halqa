import { createClient } from '@supabase/supabase-js'

// Hardcoded on purpose: env vars caused repeated Vercel deploy failures on the
// free tier. This is the public anon key, already shipped to every browser.
export const SUPABASE_URL = 'https://zietsuiuzkfjjgbdybdd.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppZXRzdWl1emtmampnYmR5YmRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDYxNTcsImV4cCI6MjA5Nzk4MjE1N30.0MiKalT81TjwWFQmXM3D6umtbYEAN8RS3SzmWZxTJZg'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export function publicUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
}
