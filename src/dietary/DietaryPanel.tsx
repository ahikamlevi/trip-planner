import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useTripRealtime } from '../lib/useTripRealtime'
import { useT } from '../i18n/I18nProvider'
import { DICTS, LANGUAGES, type Lang } from '../i18n/strings'
import { ALLERGEN_TAGS, DIET_TAGS, isAllergen, type DietaryTag } from '../places/dietary'

interface DietMember {
  user_id: string
  profile: {
    display_name: string | null
    dietary_restrictions: string[] | null
    dietary_note: string | null
  } | null
}

export function DietaryPanel({ tripId }: { tripId: string }) {
  const { t } = useT()
  const { session } = useAuth()
  const uid = session!.user.id
  const [members, setMembers] = useState<DietMember[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('trip_members')
      .select('user_id, profile:profiles(display_name, dietary_restrictions, dietary_note)')
      .eq('trip_id', tripId)
      .returns<DietMember[]>()
    if (error) setError(error.message)
    else setMembers(data ?? [])
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])

  useTripRealtime(tripId, load)

  const withRestrictions = (members ?? []).filter(
    (m) => (m.profile?.dietary_restrictions?.length ?? 0) > 0 || m.profile?.dietary_note,
  )

  return (
    <section className="card">
      <h3>{t('diet.title')}</h3>
      {error && <p className="auth-error">{error}</p>}
      {members === null && <p className="muted small">{t('common.loading')}</p>}

      {members !== null && (
        <>
          <SelfEditor
            uid={uid}
            member={members.find((m) => m.user_id === uid) ?? null}
            onSaved={load}
          />

          <div className="diet-others">
            {members
              .filter((m) => m.user_id !== uid)
              .map((m) => (
                <MemberSummary key={m.user_id} member={m} />
              ))}
          </div>

          <AllergyCard members={withRestrictions} />
        </>
      )}
    </section>
  )
}

function SelfEditor({
  uid,
  member,
  onSaved,
}: {
  uid: string
  member: DietMember | null
  onSaved: () => void
}) {
  const { t } = useT()
  const [tags, setTags] = useState<string[]>(member?.profile?.dietary_restrictions ?? [])
  const [note, setNote] = useState(member?.profile?.dietary_note ?? '')
  const [saving, setSaving] = useState(false)

  function toggle(tag: DietaryTag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]))
  }

  async function save() {
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ dietary_restrictions: tags, dietary_note: note.trim() || null })
      .eq('id', uid)
    setSaving(false)
    if (!error) onSaved()
  }

  function chip(tag: DietaryTag) {
    return (
      <button
        key={tag}
        type="button"
        className={`cat-chip${tags.includes(tag) ? ' active' : ''}`}
        aria-pressed={tags.includes(tag)}
        onClick={() => toggle(tag)}
      >
        {t(`diet.tag.${tag}`)}
      </button>
    )
  }

  return (
    <div className="diet-self">
      <strong>{t('diet.yourRestrictions')}</strong>

      <span className="diet-group-label muted small">{t('diet.allergiesGroup')}</span>
      <div className="cat-chips diet-chips">{ALLERGEN_TAGS.map(chip)}</div>

      <span className="diet-group-label muted small">{t('diet.dietGroup')}</span>
      <div className="cat-chips diet-chips">{DIET_TAGS.map(chip)}</div>

      <label>
        {t('diet.note')}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('diet.noteHint')} />
      </label>
      <div className="button-row">
        <button onClick={save} disabled={saving}>
          {saving ? t('auth.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )
}

function MemberSummary({ member }: { member: DietMember }) {
  const { t } = useT()
  const tags = member.profile?.dietary_restrictions ?? []
  const name = member.profile?.display_name || t('tripview.unnamed')
  if (tags.length === 0 && !member.profile?.dietary_note) return null
  return (
    <p className="diet-member small">
      <strong>{name}:</strong>{' '}
      {tags.map((tag) => t(`diet.tag.${tag}`)).join(', ')}
      {member.profile?.dietary_note ? ` — ${member.profile.dietary_note}` : ''}
    </p>
  )
}

// A printable allergy card. The card language is independent of the UI language,
// so you can show it in a language the locals read (defaults to English).
function AllergyCard({ members }: { members: DietMember[] }) {
  const { t, lang } = useT()
  const [cardLang, setCardLang] = useState<Lang>(lang === 'he' ? 'en' : 'he')

  // Translate a key in the chosen CARD language (not the UI language).
  const td = (key: string) => DICTS[cardLang][key] ?? DICTS.en[key] ?? key

  if (members.length === 0) {
    return <p className="muted small">{t('diet.cardEmpty')}</p>
  }

  return (
    <div className="diet-card-block">
      <div className="section-head">
        <strong>{t('diet.cardTitle')}</strong>
        <span className="diet-card-controls">
          <select value={cardLang} onChange={(e) => setCardLang(e.target.value as Lang)} aria-label={t('a11y.language')}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <button className="secondary" onClick={() => window.print()}>
            {t('diet.print')}
          </button>
        </span>
      </div>

      <div className="diet-card" dir={cardLang === 'he' ? 'rtl' : 'ltr'} lang={cardLang}>
        <p className="diet-card-intro">{td('diet.cardIntro')}</p>
        {members.map((m) => {
          const tags = m.profile?.dietary_restrictions ?? []
          const avoid = tags.filter(isAllergen)
          const diet = tags.filter((tag) => !isAllergen(tag))
          const name = m.profile?.display_name || td('tripview.unnamed')
          const list = (xs: string[]) => xs.map((tag) => td(`diet.tag.${tag}`)).join(', ')
          return (
            <div key={m.user_id} className="diet-card-person">
              <strong className="diet-card-name">{name}</strong>
              {avoid.length > 0 && (
                <p className="diet-card-line diet-card-avoid">
                  ⚠ {td('diet.cardAvoidLine').replace('{items}', list(avoid))}
                </p>
              )}
              {diet.length > 0 && (
                <p className="diet-card-line">
                  {td('diet.cardDietLine').replace('{items}', list(diet))}
                </p>
              )}
              {m.profile?.dietary_note && (
                <p className="diet-card-line diet-card-note">{m.profile.dietary_note}</p>
              )}
            </div>
          )
        })}
        <p className="diet-card-outro">{td('diet.cardOutro')}</p>
      </div>
    </div>
  )
}
