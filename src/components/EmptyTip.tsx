// A friendly "what to do here" hint for an empty tab/panel. Subtler than the full-page
// .empty-state (used on the dashboard) — sits inline inside a panel and disappears once
// the user adds content. Purely informational; the actual actions live elsewhere on the
// page (search box, find-nearby bar, the day calendar, the add inputs).

export function EmptyTip({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div className="empty-tip">
      <span className="empty-tip-emoji" aria-hidden="true">
        {emoji}
      </span>
      <div className="empty-tip-text">
        <p className="empty-tip-title">{title}</p>
        <p className="muted small">{body}</p>
      </div>
    </div>
  )
}
