# Stage 1 — Setup

The code is built. These are the parts only you can do (signups + keys). ~15 minutes.

## 1. Create the Supabase project
1. Go to <https://supabase.com> → sign in → **New project**.
2. Name it (e.g. `trip-planner`), pick a region near you, set a database password (save it).
3. Wait ~2 min for it to provision.

## 2. Run the database migration
1. In the project, open **SQL Editor** → **New query**.
2. Paste the entire contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) and click **Run**.
3. You should see "Success. No rows returned." This creates every table, the RLS
   policies, and the signup/owner triggers.

## 3. Lock down sign-ups (this is the security part)
So nobody can create an account just by knowing an email:
1. **Authentication** → **Sign In / Providers** (or **Providers**) → ensure **Email** is enabled.
2. **Authentication** → **Sign-ups**: turn **Allow new users to sign up** **OFF**.
3. Now add your two accounts by hand: **Authentication** → **Users** → **Add user**
   → **Send invitation** (or "Create new user") for your email and your wife's.
   - The signup trigger auto-creates a `profiles` row for each.

With sign-ups off, the magic-link form will only work for these two addresses.
Anyone else who types their email gets nothing — and a magic link only ever lands
in the real inbox, so typing *your* email just sends a link to *you*.

## 4. Point the app at Supabase
1. In Supabase: **Project Settings** → **API**. Copy the **Project URL** and the
   **anon / public** key (NOT the `service_role` key).
2. In the project folder, copy `.env.example` to `.env` and paste both values:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

## 4b. Set the auth redirect URLs (do this before inviting/clicking links)
Magic-link and invite emails redirect to Supabase's configured **Site URL**. The
default is `http://localhost:3000`, but this app runs on `http://localhost:5173`,
so the link would fail. Fix it: **Authentication → URL Configuration**:
- **Site URL** → `http://localhost:5173`
- **Redirect URLs** → add `http://localhost:5173/**` (and your Vercel URL later)

The redirect is baked into each email when sent, so if you already clicked a bad
link, **re-send** the invite/magic link after changing this.

## 5. Run it locally
```
npm install
npm run dev
```
Open the printed URL, enter one of your two emails, click the magic link in your
inbox → you should land on an empty "Your trips" dashboard. That's Stage 1 done.

## 6. Deploy to Vercel (optional now, needed to be "live on the web")
1. Push this folder to a GitHub repo.
2. <https://vercel.com> → **Add New → Project** → import the repo.
   Framework preset: **Vite** (auto-detected). Build command `npm run build`,
   output `dist` — both default.
3. In the Vercel project: **Settings → Environment Variables**, add the same two
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` values. Redeploy.
4. Back in Supabase: **Authentication → URL Configuration**, add your Vercel URL
   (e.g. `https://trip-planner.vercel.app`) to **Site URL** and **Redirect URLs**,
   so magic links sent from the deployed site redirect correctly.

---

When this works, tell me and we move to **Stage 2 — Trips & sharing**.
