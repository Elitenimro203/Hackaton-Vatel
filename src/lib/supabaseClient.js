// Client Supabase unique, configuré avec les variables du fichier .env.
import { createClient } from '@supabase/supabase-js'

const urlSupabase = import.meta.env.VITE_SUPABASE_URL
const cleAnonyme = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(urlSupabase, cleAnonyme)
