import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useTripRealtime } from '../lib/useTripRealtime'
import { useToast } from '../components/Toast'
import { useT } from '../i18n/I18nProvider'
import { EmptyTip } from '../components/EmptyTip'
import type { PackingItem } from '../lib/database.types'

export function PackingPanel({ tripId }: { tripId: string }) {
  const { t } = useT()
  const toast = useToast()
  const [items, setItems] = useState<PackingItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [label, setLabel] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('packing_items')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setItems(data ?? [])
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])

  useTripRealtime(tripId, load)

  async function add(e: FormEvent) {
    e.preventDefault()
    const text = label.trim()
    if (!text) return
    setLabel('')
    const { error } = await supabase.from('packing_items').insert({ trip_id: tripId, label: text })
    if (error) setError(error.message)
    else load()
  }

  async function toggle(item: PackingItem) {
    await supabase.from('packing_items').update({ packed: !item.packed }).eq('id', item.id)
    load()
  }

  async function remove(item: PackingItem) {
    const { error } = await supabase.from('packing_items').delete().eq('id', item.id)
    if (error) {
      toast.error(t('common.deleteFailed'))
      return
    }
    load()
    // Clean to undo — packing items have no references, so just re-insert.
    toast.success(t('packing.removed', { label: item.label }), {
      actionLabel: t('common.undo'),
      onAction: async () => {
        await supabase
          .from('packing_items')
          .insert({ trip_id: tripId, label: item.label, packed: item.packed, sort_order: item.sort_order })
        load()
      },
    })
  }

  const packed = items?.filter((i) => i.packed).length ?? 0
  const total = items?.length ?? 0

  return (
    <div className="packing card">
      <div className="section-head">
        <h3>{t('packing.title')}</h3>
        {total > 0 && <span className="muted small">{t('packing.packedCount', { packed, total })}</span>}
      </div>
      {error && <p className="auth-error">{error}</p>}

      <form className="packing-add" onSubmit={add}>
        <input value={label} placeholder={t('packing.addItem')} onChange={(e) => setLabel(e.target.value)} />
        <button type="submit" disabled={!label.trim()}>{t('common.add')}</button>
      </form>

      {items === null && <p className="muted small">{t('common.loading')}</p>}
      {items !== null && items.length === 0 && (
        <EmptyTip emoji="🎒" title={t('tip.packing.title')} body={t('tip.packing.body')} />
      )}

      <ul className="packing-list">
        {(items ?? []).map((item) => (
          <li key={item.id} className={item.packed ? 'packed' : ''}>
            <label>
              <input type="checkbox" checked={item.packed} onChange={() => toggle(item)} />
              <span>{item.label}</span>
            </label>
            <button className="linklike danger" onClick={() => remove(item)} title={t('common.remove')} aria-label={`${t('common.remove')} ${item.label}`}>×</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
