# Letters for Baby 💌

A dark-romantic shared letter app built with React + Vite + Supabase Auth/PostgreSQL.

## Features

- Email magic-link sign-in
- One shared private couple space with an 8-character invite code
- Write letters to your partner, categorized by mood/situation
- Random letter from your partner, with a best-effort avoidance of the immediately previous letter
- Animated envelope opening
- Browse letters from your partner or letters you've written
- Supabase Row Level Security (RLS) policies for profiles, memberships, and letters

## 1. Requirements

- Node.js 20+ recommended
- A Supabase account/project
- A Vercel account if you want a public link

## 2. Create Supabase project

1. Create a project at https://supabase.com/dashboard.
2. Open **SQL Editor** in the project dashboard.
3. Paste and run all of `supabase/schema.sql`.
4. Open **Project Settings → API** (or the API keys page) and copy the Project URL and the publishable key / legacy anon key.
5. In **Authentication → URL Configuration**, set your local development URL to `http://localhost:5173`. Add your eventual deployed Vercel URL to the allowed redirect URLs after deployment.
6. In **Authentication → Providers → Email**, ensure email OTP/magic links are enabled. Configure SMTP for reliable production delivery; Supabase's default email service may be rate-limited.

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
```

Do not use the `service_role` key in a frontend `.env`. The publishable/anon key is intended for client apps; RLS policies protect the data.

Then run:

```bash
npm run dev
```

Open the local URL Vite prints, usually http://localhost:5173.

## 4. Sign in and pair

1. Enter your email and tap **Send me a sign-in link**.
2. Open the email on the same device/browser, tap the link, and return to the app.
3. The first person clicks **Create our space**. Copy the 8-character invite code.
4. Send that code privately to your partner.
5. Your partner signs in with their own email and enters the code under **Join your person**.
6. Both accounts now use the same couple space.

## 5. Deploy to Vercel

1. Push this folder to a private or public GitHub repository.
2. In Vercel, import the repository.
3. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
4. Add environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel project settings.
5. Deploy.
6. In Supabase **Authentication → URL Configuration**, add the Vercel production URL to **Site URL** and **Redirect URLs**. Add preview URLs only if you intend to use them.
7. Redeploy after setting environment variables.

## 6. Security notes

- Never put the Supabase `service_role` secret in frontend code or Vercel `VITE_` variables.
- RLS policies scope letters to the couple membership and allow edits/deletes only by the author.
- Invite codes are intended to be shared privately. Anyone who obtains a code before the second member joins could claim the second seat, so share it only with your partner and regenerate/recreate the space if it leaks.
- This is a starter implementation, not a security audit. Test with two separate accounts and verify that a third account cannot join or read either couple's letters.
- The random letter feature selects randomly from the partner's existing letters in the browser. It is a surprise, not cryptographic randomness.
- This version supports one couple per account and caps each couple at two members.

## 7. Troubleshooting

- **Magic link returns to an error page:** confirm the exact URL is in Supabase Auth redirect URLs and that the app is running at that URL.
- **No email arrives:** check spam, email provider settings, and Supabase Auth email rate limits. Configure custom SMTP for production.
- **RLS error:** rerun `supabase/schema.sql` in a fresh project and confirm you're signed in and paired.
- **Changes to `.env` don't apply:** stop and restart Vite.
- **Vercel shows missing Supabase configuration:** add both environment variables and redeploy.

## Folder structure

```text
letters-for-baby/
├── index.html
├── package.json
├── .env.example
├── README.md
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── styles.css
│   └── lib/supabase.js
└── supabase/
    └── schema.sql
```
