import { Component, type ErrorInfo, type ReactNode } from 'react'
import { DICTS, type Lang } from '../i18n/strings'
import { captureException } from '../lib/sentry'

function tr(key: string): string {
  const lang = (document.documentElement.lang === 'en' ? 'en' : 'he') as Lang
  return DICTS[lang][key] ?? DICTS.en[key] ?? key
}

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** Catches render errors so a crash shows a message instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info)
    // No-op if Sentry isn't initialized (no DSN).
    captureException(error, { componentStack: info.componentStack })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="centered">
          <div className="auth-card">
            <h1>{tr('error.title')}</h1>
            <p className="auth-note">{tr('error.intro')}</p>
            <pre className="error-detail">{this.state.error.message}</pre>
            <button onClick={() => location.reload()}>{tr('error.reload')}</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
