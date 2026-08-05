# Supabase setup (TASK-0006)

One-time setup on your existing Supabase project:

1. Dashboard -> SQL Editor -> paste and run `reset-legacy.sql`
   (removes tables from earlier AGS experiments — review first).
2. Paste and run `migrations/202608040001_ags_v2_core.sql`.
3. `.env.local` needs (Settings -> API):

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

The secret/service key is NOT used — the app relies on user sessions + RLS.

Without these variables the app runs in mock mode exactly as before;
with them, sign-in appears in the sidebar and wizard-created charts are
saved privately per user.
