import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://zietsuiuzkfjjgbdybdd.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppZXRzdWl1emtmampnYmR5YmRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA5MTcyMzQsImV4cCI6MjA2NjQ5MzIzNH0.0MiKaI-T81TjwWFQmXM3D6umtbYEAN8RS3Szm-WZxTJZg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
