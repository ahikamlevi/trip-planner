import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useTripRealtime } from '../lib/useTripRealtime'
import { useToast } from '../components/Toast'
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

interface Companion {
  id: string
  name: string
  dietary_restrictions: string[]
  dietary_note: string | null
}

// One person on the allergy card — an account member or a non-account companion.
interface CardPerson {
  id: string
  name: string
  restrictions: string[]
  note: string | null
}

export function DietaryPanel({ tripId }: { tripId: string }) {
  const { t } = useT()
  const { session } = useAuth()
  const uid = session!.user.id
  const [members, setMembers] = useState<DietMember[] | null>(null)
  const [companions, setCompanions] = useState<Companion[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [membersRes, companionsRes] = await Promise.all([
      supabase
        .from('trip_members')
        .select('user_id, profile:profiles(display_name, dietary_restrictions, dietary_note)')
        .eq('trip_id', tripId)
        .returns<DietMember[]>(),
      supabase
        .from('trip_companions')
        .select('id, name, dietary_restrictions, dietary_note')
        .eq('trip_id', tripId)
        .order('created_at')
        .returns<Companion[]>(),
    ])
    if (membersRes.error) setError(membersRes.error.message)
    else setMembers(membersRes.data ?? [])
    if (!companionsRes.error) setCompanions(companionsRes.data ?? [])
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])

  useTripRealtime(tripId, load)

  // Everyone on the card: members with restrictions + every companion with restrictions.
  const cardPeople: CardPerson[] = [
    ...(members ?? [])
      .filter((m) => (m.profile?.dietary_restrictions?.length ?? 0) > 0 || m.profile?.dietary_note)
      .map((m) => ({
        id: m.user_id,
        name: m.profile?.display_name || t('tripview.unnamed'),
        restrictions: m.profile?.dietary_restrictions ?? [],
        note: m.profile?.dietary_note ?? null,
      })),
    ...companions
      .filter((c) => c.dietary_restrictions.length > 0 || c.dietary_note)
      .map((c) => ({
        id: c.id,
        name: c.name || t('tripview.unnamed'),
        restrictions: c.dietary_restrictions,
        note: c.dietary_note,
      })),
  ]

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

          <CompanionsSection tripId={tripId} companions={companions} onChanged={load} />

          <AllergyCard people={cardPeople} />
        </>
      )}
    </section>
  )
}

// Shared allergen + diet chip groups (used by the self editor and each companion).
function DietChips({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (tag: DietaryTag) => void
}) {
  const { t } = useT()
  const chip = (tag: DietaryTag) => (
    <button
      key={tag}
      type="button"
      className={`cat-chip${selected.includes(tag) ? ' active' : ''}`}
      aria-pressed={selected.includes(tag)}
      onClick={() => onToggle(tag)}
    >
      {t(`diet.tag.${tag}`)}
    </button>
  )
  return (
    <>
      <span className="diet-group-label muted small">{t('diet.allergiesGroup')}</span>
      <div className="cat-chips diet-chips">{ALLERGEN_TAGS.map(chip)}</div>
      <span className="diet-group-label muted small">{t('diet.dietGroup')}</span>
      <div className="cat-chips diet-chips">{DIET_TAGS.map(chip)}</div>
    </>
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
  const toast = useToast()
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
    if (error) toast.error(t('common.saveFailed'))
    else {
      onSaved()
      toast.success(t('common.saved'))
    }
  }

  return (
    <div className="diet-self">
      <strong>{t('diet.yourRestrictions')}</strong>

      <DietChips selected={tags} onToggle={toggle} />

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

// Non-account travelers (children, a partner who doesn't use the app). Any trip member can
// add/edit/remove these; they're merged with account members on the allergy card.
function CompanionsSection({
  tripId,
  companions,
  onChanged,
}: {
  tripId: string
  companions: Companion[]
  onChanged: () => void
}) {
  const { t } = useT()
  const toast = useToast()
  const [adding, setAdding] = useState(false)

  async function addPerson() {
    setAdding(true)
    const { error } = await supabase
      .from('trip_companions')
      .insert({ trip_id: tripId, name: t('diet.personName') })
    setAdding(false)
    if (error) toast.error(t('common.saveFailed'))
    else onChanged()
  }

  return (
    <div className="diet-companions">
      <strong>{t('diet.companions')}</strong>
      <p className="muted small">{t('diet.companionsHint')}</p>

      {companions.map((c) => (
        <CompanionEditor key={c.id} companion={c} onChanged={onChanged} />
      ))}

      <div className="button-row">
        <button className="secondary" onClick={addPerson} disabled={adding}>
          {t('diet.addPerson')}
        </button>
      </div>
    </div>
  )
}

function CompanionEditor({ companion, onChanged }: { companion: Companion; onChanged: () => void }) {
  const { t } = useT()
  const toast = useToast()
  const [name, setName] = useState(companion.name)
  const [tags, setTags] = useState<string[]>(companion.dietary_restrictions)
  const [note, setNote] = useState(companion.dietary_note ?? '')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  function toggle(tag: DietaryTag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]))
  }

  async function save() {
    setSaving(true)
    const { error } = await supabase
      .from('trip_companions')
      .update({
        name: name.trim() || t('diet.personName'),
        dietary_restrictions: tags,
        dietary_note: note.trim() || null,
      })
      .eq('id', companion.id)
    setSaving(false)
    if (error) toast.error(t('common.saveFailed'))
    else {
      onChanged()
      toast.success(t('common.saved'))
    }
  }

  async function remove() {
    setRemoving(true)
    const { error } = await supabase.from('trip_companions').delete().eq('id', companion.id)
    setRemoving(false)
    if (error) toast.error(t('common.saveFailed'))
    else {
      onChanged()
      toast.success(t('common.saved'))
    }
  }

  return (
    <div className="diet-companion">
      <div className="diet-companion-head">
        <input
          className="diet-companion-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('diet.personName')}
          aria-label={t('diet.personName')}
        />
        <button
          type="button"
          className="linklike danger"
          onClick={remove}
          disabled={removing}
          aria-label={t('diet.removePerson')}
          title={t('diet.removePerson')}
        >
          ×
        </button>
      </div>

      <DietChips selected={tags} onToggle={toggle} />

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

// A printable allergy card. The card language is independent of the UI language,
// so you can show it in a language the locals read (defaults to English).
function AllergyCard({ people }: { people: CardPerson[] }) {
  const { t, lang, locale } = useT()
  const [cardLang, setCardLang] = useState<Lang>(lang === 'he' ? 'en' : 'he')

  // Translate a key in the chosen CARD language (not the UI language).
  const td = (key: string) => DICTS[cardLang][key] ?? DICTS.en[key] ?? key

  if (people.length === 0) {
    return <p className="muted small">{t('diet.cardEmpty')}</p>
  }

  // Label each language so the user (reading the UI language) can recognize it — the whole
  // point of the card is to pick a language you DON'T read, so the endonym alone is useless.
  // Show the name in the UI language via Intl.DisplayNames + the endonym, e.g. "Thai — ไทย".
  const displayNames = (() => {
    try {
      return new Intl.DisplayNames([locale], { type: 'language' })
    } catch {
      return null
    }
  })()
  const langOptionLabel = (code: Lang, endonym: string) => {
    const localized = displayNames?.of(code)
    if (localized && localized.toLowerCase() !== code.toLowerCase() && localized !== endonym) {
      return `${localized} — ${endonym}`
    }
    return endonym
  }

  return (
    <div className="diet-card-block">
      <div className="section-head">
        <strong>{t('diet.cardTitle')}</strong>
        <span className="diet-card-controls">
          <select value={cardLang} onChange={(e) => setCardLang(e.target.value as Lang)} aria-label={t('a11y.language')}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {langOptionLabel(l.code, l.label)}
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
        {people.map((p) => {
          const avoid = p.restrictions.filter(isAllergen)
          const diet = p.restrictions.filter((tag) => !isAllergen(tag))
          const list = (xs: string[]) => xs.map((tag) => td(`diet.tag.${tag}`)).join(', ')
          return (
            <div key={p.id} className="diet-card-person">
              <strong className="diet-card-name">{p.name}</strong>
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
              {p.note && <p className="diet-card-line diet-card-note">{p.note}</p>}
            </div>
          )
        })}
        <p className="diet-card-outro">{td('diet.cardOutro')}</p>
      </div>
    </div>
  )
}
