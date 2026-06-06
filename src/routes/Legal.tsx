import { Link } from 'react-router-dom'
import { useT } from '../i18n/I18nProvider'

// Starter Privacy Policy + Terms of Service. English only by design (legal text is
// risky to machine-translate). THIS IS NOT LEGAL ADVICE — review/replace the bracketed
// placeholders and have it checked before relying on it for a public launch.
const LAST_UPDATED = '2026-06-06'
const CONTACT_EMAIL = 'fantasy.vortex.games@gmail.com'
const GOVERNING_LAW = 'Israel'

export function Legal() {
  const { t } = useT()
  return (
    <div className="page">
      <header className="app-header">
        <Link to="/" className="app-title">{t('appName')}</Link>
      </header>

      <main className="page-body legal" id="main" tabIndex={-1}>
        <Link to="/" className="back-link">→ {t('tripview.allTrips')}</Link>
        <p className="muted small">Last updated: {LAST_UPDATED}</p>

        <h1>Privacy Policy</h1>
        <p>
          Trip Planner (“the app”, “we”) is a collaborative travel-planning tool. This
          policy explains what we collect, why, and your choices. By using the app you
          agree to this policy.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li><strong>Account:</strong> your email address and, optionally, a display name.</li>
          <li><strong>Trip content you enter:</strong> trips, places, itineraries, notes,
            budgets, packing lists, and any people you add as travel companions.</li>
          <li><strong>Dietary information you choose to add:</strong> allergy and diet tags
            and notes, for yourself and for companions you enter. Provide only what you’re
            comfortable storing.</li>
          <li><strong>Technical data:</strong> basic device/browser info and error reports
            used to keep the app working.</li>
        </ul>

        <h2>How we use it</h2>
        <p>
          To provide the service: store your plans, sync edits live between members of a
          trip, show maps and place suggestions, and diagnose errors. We do not sell your
          personal data.
        </p>

        <h2>Sharing &amp; service providers</h2>
        <p>
          Trip content is shared with the people you invite to that trip. We rely on these
          processors, who handle data on our behalf:
        </p>
        <ul>
          <li><strong>Supabase</strong> — database, authentication, storage.</li>
          <li><strong>Vercel</strong> — application hosting.</li>
          <li><strong>Stadia Maps</strong> — map tiles, geocoding, routing (receives the
            coordinates/areas you view).</li>
          <li><strong>Foursquare</strong> — nearby-place discovery (receives the map area
            you search).</li>
          <li><strong>Open-Meteo</strong> — weather for your trip locations.</li>
          <li><strong>Resend</strong> — transactional email (sign-in, confirmation, reset).</li>
          <li><strong>Sentry</strong> — error monitoring.</li>
        </ul>

        <h2>Cookies &amp; local storage</h2>
        <p>
          We use your browser’s local storage for your sign-in session and preferences
          (theme, language) and to cache search results. We don’t use third-party
          advertising or tracking cookies.
        </p>

        <h2>Retention &amp; deletion</h2>
        <p>
          We keep your data while your account is active. You can delete your account at any
          time from the ⚙️ account menu (“Delete account”). This permanently removes your
          account, the trips you own and their content, and your membership in shared trips.
          This cannot be undone.
        </p>

        <h2>Children</h2>
        <p>
          The app is not directed to children. Companion entries (including children) are
          created and managed by the adult account holder.
        </p>

        <h2>Contact</h2>
        <p>Questions about this policy: {CONTACT_EMAIL}.</p>

        <hr />

        <h1>Terms of Service</h1>

        <h2>Acceptance</h2>
        <p>By creating an account or using the app, you agree to these terms.</p>

        <h2>Your responsibilities</h2>
        <p>
          Use the app lawfully. You’re responsible for the content you enter and for
          inviting only people you intend to share a trip with.
        </p>

        <h2>Dietary &amp; allergy information — important</h2>
        <p>
          The dietary tags and printable allergy card are planning aids only and may be
          incomplete or contain translation errors. They are <strong>not medical advice</strong>.
          Always confirm allergy and ingredient details directly with restaurants and
          medical professionals. We are not responsible for reactions or harm arising from
          reliance on this feature.
        </p>

        <h2>Third-party data</h2>
        <p>
          Maps, routes, travel times, place details, opening hours, and weather come from
          third-party services and may be inaccurate or unavailable. Verify anything you
          rely on for travel decisions.
        </p>

        <h2>Availability &amp; “as is”</h2>
        <p>
          The app is provided “as is”, without warranties of any kind. We don’t guarantee it
          will be uninterrupted or error-free, and we may change or discontinue features.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, we are not liable for any indirect,
          incidental, or consequential damages arising from your use of the app.
        </p>

        <h2>Termination</h2>
        <p>
          You may stop using the app and delete your account at any time. We may suspend
          accounts that violate these terms.
        </p>

        <h2>Governing law</h2>
        <p>These terms are governed by the laws of {GOVERNING_LAW}.</p>

        <h2>Contact</h2>
        <p>{CONTACT_EMAIL}.</p>

        <Link to="/" className="back-link">→ {t('tripview.allTrips')}</Link>
      </main>
    </div>
  )
}
