import * as Sentry from '@sentry/react'

// Error monitoring. Initializes ONLY when VITE_SENTRY_DSN is set, so the app runs
// fine locally and for anyone without a Sentry project — it's opt-in via env.
// Captures uncaught errors + unhandled promise rejections automatically (global
// handlers), plus anything reported via Sentry.captureException (see ErrorBoundary).
// Light performance tracing for Web Vitals; no session replay (keeps the bundle lean).
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1, // 10% of transactions; errors are always captured
    sendDefaultPii: false, // don't attach IPs / request bodies
  })
}

export { Sentry }
