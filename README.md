# Letters for Baby 💌

A dark-romantic shared letter app built with React + Vite + Supabase Auth/PostgreSQL.

## Features

- Persistent anonymous guest sessions
- One shared private couple space with an 8-character invite code
- Write letters to your partner, categorized by mood/situation
- Opt-in push notifications when your partner writes a letter
- Random letter from your partner, with a best-effort avoidance of the immediately previous letter
- Animated envelope opening
- Browse letters from your partner or letters you've written
- Supabase Row Level Security (RLS) policies for profiles, memberships, and letters

## 1. Requirements

- Node.js 20+ recommended
- A Supabase account/project with Anonymous Sign-Ins enabled
- A Vercel account if you want a public link

## 2. Create Supabase project

1. Create a project at https://supabase.com/dashboard.
2. Open **SQL Editor** in the project dashboard.
3. Paste and run all of `supabase/schema.sql`.
4. Open **Project Settings → API** (or the API keys page) and copy the Project URL and the publishable key / legacy anon key.
5. In Supabase Authentication settings, enable **Anonymous Sign-Ins**.
6. In **Authentication → URL Configuration**, add your deployed Vercel URL to the allowed URLs.

## 3. Run locally

```bash
npm install
cp .env.example .env
```

On Windows PowerShell, use this instead of `cp` if needed:

```powershell
Copy-Item .env.example .env
```

Edit `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
VITE_VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY
```

Do not use the `service_role` key in a frontend `.env`. The publishable/anon key is intended for client apps; RLS policies protect the data.

Then run:

```bash
npm run dev
```

Open the local URL Vite prints, usually http://localhost:5173.

## 4. Enable push notifications

Push requires HTTPS (localhost is supported for development). Generate a VAPID key pair with `npx web-push generate-vapid-keys --json`. Put the public key in `VITE_VAPID_PUBLIC_KEY` in `.env`; keep the private key out of the frontend.

Install the Supabase CLI and sign in. If this repository has not been initialized for the CLI yet, run `supabase init` once. Then link the project, set the private push secrets, and deploy the notification function:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_ID
supabase secrets set VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY=YOUR_VAPID_PRIVATE_KEY VAPID_SUBJECT=mailto:you@example.com
supabase functions deploy notify-letter
```

For a new database, `supabase/schema.sql` includes the push-subscription table. For an existing project, run `supabase/push-notifications-existing-project.sql` once in the SQL Editor. Rebuild/redeploy the frontend after setting `VITE_VAPID_PUBLIC_KEY`.

Each person must open the app on their own device and tap **Enable notifications**. On iPhone/iPad, open the site in Safari, choose **Share → Add to Home Screen**, launch that Home Screen app, and then enable notifications (iOS/iPadOS 16.4 or later). Current Android browsers support web push. Notification permission can be revoked in device/browser settings.

Push content is intentionally generic so letter text is not exposed on a lock screen. Delivery uses the Supabase Edge Function and the private VAPID key; only the public key and device push subscription are stored by the app.

## 5. Open a guest session and pair

1. Open the app; it creates a private guest session in that browser.
2. The first person clicks **Create our space**. Copy the 8-character invite code.
3. Send that code privately to your partner.
4. Your partner opens the app on their own device/browser and enters the code under **Join your person**.
5. Both guest accounts now use the same couple space.

## 6. Deploy to Vercel

1. Push this folder to a private or public GitHub repository.
2. In Vercel, import the repository.
3. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
4. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_VAPID_PUBLIC_KEY` in Vercel project settings.
5. Deploy.
6. In Supabase **Authentication → URL Configuration**, add the Vercel production URL to **Site URL** and **Redirect URLs**. Add preview URLs only if you intend to use them.
7. Redeploy after setting environment variables.

## 7. Security notes

- Never put the Supabase `service_role` secret in frontend code or Vercel `VITE_` variables.
- RLS policies scope letters to the couple membership and allow edits/deletes only by the author.
- Invite codes are intended to be shared privately. Anyone who obtains a code before the second member joins could claim the second seat, so share it only with your partner and regenerate/recreate the space if it leaks.
- This is a starter implementation, not a security audit. Test with two separate accounts and verify that a third account cannot join or read either couple's letters.
- Guest sessions and push subscriptions are tied to a browser/device. **New Session** removes the device's old push subscription before creating another guest identity.
- Push delivery requires the migration, VAPID secrets, and deployed Edge Function; saving letters still works if delivery is temporarily unavailable.
- The random letter feature selects randomly from the partner's existing letters in the browser. It is a surprise, not cryptographic randomness.
- This version supports one couple per account and caps each couple at two members.

## 8. Troubleshooting

- **Notifications do not appear:** confirm the recipient enabled notifications, the site is HTTPS, the frontend and Edge Function use the same VAPID keys, and `notify-letter` is deployed.
- **iPhone/iPad cannot enable notifications:** add the site to the Home Screen from Safari, open it there, and ensure iOS/iPadOS is 16.4 or later.
- **RLS error:** rerun `supabase/schema.sql` in a fresh project and confirm you're signed in and paired.
- **Changes to `.env` don't apply:** stop and restart Vite.
- **Vercel shows missing configuration:** add the Supabase URL/key and VAPID public key, then redeploy.

## Folder structure

```text
letters-for-baby/
├── index.html
├── package.json
├── .env.example
├── README.md
├── public/
│   ├── icon.svg
│   ├── manifest.webmanifest
│   └── sw.js
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── styles.css
│   └── lib/supabase.js
└── supabase/
    ├── functions/notify-letter/index.ts
    ├── schema.sql
    └── push-notifications-existing-project.sql
```
