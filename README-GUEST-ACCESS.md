# Guest access setup (existing Supabase project)

This update replaces magic-link login with Supabase Anonymous Auth. Visitors do not enter an email, but Supabase still creates an authenticated user ID and persistent browser session, so the existing `authenticated` RLS policies continue to protect couple data.

## Required dashboard setting

1. Supabase Dashboard → Authentication → Sign In / Providers (or Sign In Methods).
2. Enable **Anonymous Sign-Ins**.
3. Save.

## Apply the database migration

For the project that already has the four tables, open SQL Editor → New query and run `supabase/guest-migration-existing-project.sql` once. Do not rerun the original whole schema file on the existing database: it creates policies that may already exist.

## Run the updated app

Keep your existing `.env` values. In the project folder run:

```bash
npm install
npm run dev
```

Open the local URL. A guest session should be created automatically. Each partner must use their own browser/device and create or join the couple using the invite code.

## Important limitations

- Anonymous sessions are tied to the browser's local storage. Clearing site data, switching browsers/devices, or losing the session can permanently lose access to that guest identity and its couple membership. The app currently has no account-recovery mechanism.
- Treat the invite code like a secret; only share it with your partner. Anyone who obtains an unused invite code may be able to join that couple if a slot is available.
- Keep RLS enabled and never expose the Supabase service-role key in the frontend.
