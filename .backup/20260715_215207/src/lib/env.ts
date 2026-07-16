// Server-side only env access
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!;
export const GROQ_API_KEY = process.env.GROQ_API_KEY!;
export const JINA_API_KEY = process.env.JINA_API_KEY!;
export const GMAIL_USER = process.env.GMAIL_USER!;
export const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD!;
export const NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';