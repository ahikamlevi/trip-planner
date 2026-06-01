# Custom SMTP with Resend

Replaces Supabase's throttled built-in email sender (~3–4/hour) with Resend's free
tier (much higher limits), so magic-link/invite emails stop hitting the rate limit.
No app code changes — this is all dashboard config.

## 1. Create a Resend account + API key
1. Go to <https://resend.com> → sign up (free tier, no credit card).
2. In the Resend dashboard → **API Keys** → **Create API Key**.
   - Name: `trip-planner-supabase`, permission **Sending access**.
3. Copy the key (starts with `re_…`). You only see it once — save it.

## 2. Pick a sender address
You have two options:

- **Quick / no domain:** use Resend's built-in test sender `onboarding@resend.dev`.
  ⚠️ **Limitation:** until you verify your own domain, Resend only delivers to the
  email address you signed up to Resend with. Fine for testing *your* login, but
  your wife's magic links won't arrive until you do the step below.
- **Real / recommended:** verify a domain you own in Resend → **Domains** → **Add
  Domain**, add the DNS records they give you. Then you can send from
  `noreply@yourdomain.com` to anyone. (Needed for your wife's account to work.)

## 3. Turn on Custom SMTP in Supabase
Supabase dashboard → **Authentication** → **Emails** → **SMTP Settings** →
enable **Custom SMTP**, then fill in:

| Field          | Value                                                        |
| -------------- | ------------------------------------------------------------ |
| Sender email   | `onboarding@resend.dev` (or your verified `noreply@domain`)  |
| Sender name    | `Trip Planner`                                               |
| Host           | `smtp.resend.com`                                            |
| Port           | `465`                                                        |
| Username       | `resend`                                                     |
| Password       | your Resend API key (`re_…`)                                 |

Click **Save**. (If port 465 is blocked on your network, try `587`.)

## 4. Raise the auth rate limit
Supabase → **Authentication** → **Rate Limits** → increase **emails per hour**
(e.g. to 30+). The old low cap was tied to the built-in sender; with your own SMTP
you can safely raise it.

## 5. Test
1. `npm run dev` running.
2. App login → enter your email → **Send magic link**.
3. The email now comes via Resend (check Resend dashboard → **Logs** to watch it
   send). Click the link → you land on the dashboard.

## Notes
- The `service_role` key is NOT involved here — only the Resend API key, which lives
  in Supabase's settings, never in the app/frontend.
- For your wife's account to receive links, you must either verify a domain (step 2)
  or, temporarily, add her as an allowed test recipient by verifying the domain.
