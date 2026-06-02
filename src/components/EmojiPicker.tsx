// A tiny preset emoji picker for trip covers. Keeps things zero-infra (no upload):
// an emoji is just text stored on trips.cover_emoji.
export const COVER_EMOJIS = [
  '🧳', '🏖️', '🏔️', '🏙️', '🗼', '🏝️',
  '🍜', '🏛️', '🌋', '🎿', '🚗', '✈️',
  '🛶', '🏕️', '🗺️', '🌸',
] as const

export const DEFAULT_COVER = '🧳'

export function EmojiPicker({
  value,
  onChange,
  label,
}: {
  value: string | null
  onChange: (emoji: string | null) => void
  label: string
}) {
  return (
    <div className="emoji-picker-field">
      <span className="emoji-picker-label">{label}</span>
      <div className="emoji-picker">
        {COVER_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            className={`emoji-choice${value === e ? ' active' : ''}`}
            aria-pressed={value === e}
            onClick={() => onChange(value === e ? null : e)}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  )
}
