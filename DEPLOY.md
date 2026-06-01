# Deploy to Vercel + get your wife logged in

The repo is committed locally and ready. ~15 minutes. You do the signups/clicks
(Claude can't), following these exact steps.

## 1. Push the code to GitHub
1. Create an **empty** repo at <https://github.com/new> (name e.g. `trip-planner`,
   Private, **no** README/.gitignore/license — the project already has them).
2. In the project folder, connect and push (replace `YOU`):
   ```
   git remote add origin https://github.com/YOU/trip-planner.git
   git push -u origin main
   ```
   *(If you have the GitHub CLI: `gh repo create trip-planner --private --source=. --push`.)*

`.env` is git-ignored, so your Supabase keys are NOT pushed. Good.

## 2. Create the Vercel project
1. <https://vercel.com> → sign in (use “Continue with GitHub”) → **Add New → Project**.
2. Import the `trip-planner` repo. Framework preset auto-detects **Vite**; build
   command `npm run build` and output `dist` are the defaults — leave them.
3. Before the first deploy, open **Environment Variables** and add the two from your
   local `.env` (Supabase → Project Settings → API):
   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `eyJ...` (the anon/public key) |
4. **Deploy**. You'll get a URL like `https://trip-planner-xxxx.vercel.app`.

## 3. Tell Supabase about the live URL
So magic links and redirects work on the deployed site:
Supabase → **Authentication → URL Configuration**:
- **Site URL** → your Vercel URL (`https://trip-planner-xxxx.vercel.app`)
- **Redirect URLs** → add `https://trip-planner-xxxx.vercel.app/**`
  (keep `http://localhost:5173/**` too, for local dev)

## 4. Create your wife's account (password login — no email needed)
The app now supports **email + password** sign-in, so she doesn't need to receive any
email. Sign-ups stay disabled; you create her account by hand:
1. Supabase → **Authentication → Users → Add user → Create new user**.
2. Enter her email, set a **password**, and tick **Auto Confirm User**.
3. (The signup trigger creates her `profiles` row automatically.)

## 5. Share the trip + send her the link
1. In the app, open your trip → **Members & sharing** → **Invite by email** → her email.
   (Her account now exists, so this succeeds.)
2. Text/message her:
   - the Vercel URL,
   - her email, and
   - the password you set.
3. She opens the URL, enters email + password, **Sign in** → she sees the shared trip.

## Updating the live site later
Every `git push` to `main` triggers Vercel to rebuild and redeploy automatically.
Database schema changes still need their migration run in the Supabase SQL editor.

---

### Notes
- **Password reset:** there's no in-app "forgot password" yet (Stage 7 polish). If she
  forgets it, reset it from Supabase → Authentication → Users → her user → Reset password,
  or just set a new one.
- **Security:** sign-ups are off and only you + her have accounts, so the app stays
  private. Login requires the password (or a magic link to the real inbox).
