import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zietsuiuzkfjjgbdybdd.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppZXRzdWl1emtmampnYmR5YmRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDYxNTcsImV4cCI6MjA5Nzk4MjE1N30.0MiKalT81TjwWFQmXM3D6umtbYEAN8RS3SzmWZxTJZg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
