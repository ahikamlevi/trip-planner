import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useTripRealtime } from '../lib/useTripRealtime'
import type { PackingItem } from '../lib/database.types'

export function PackingPanel({ tripId }: { tripId: string }) {
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

  async function remove(id: string) {
    await supabase.from('packing_items').delete().eq('id', id)
    load()
  }

  const packed = items?.filter((i) => i.packed).length ?? 0
  const total = items?.length ?? 0

  return (
    <div className="packing card">
      <div className="section-head">
        <h3>Packing list</h3>
        {total > 0 && <span className="muted small">{packed}/{total} packed</span>}
      </div>
      {error && <p className="auth-error">{error}</p>}

      <form className="packing-add" onSubmit={add}>
        <input value={label} placeholder="Add an item…" onChange={(e) => setLabel(e.target.value)} />
        <button type="submit" disabled={!label.trim()}>Add</button>
      </form>

      {items === null && <p className="muted small">Loading…</p>}
      {items !== null && items.length === 0 && (
        <p className="muted small">Nothing yet — add what you need to pack. Shared with everyone on the trip.</p>
      )}

      <ul className="packing-list">
        {(items ?? []).map((item) => (
          <li key={item.id} className={item.packed ? 'packed' : ''}>
            <label>
              <input type="checkbox" checked={item.packed} onChange={() => toggle(item)} />
              <span>{item.label}</span>
            </label>
            <button className="linklike danger" onClick={() => remove(item.id)} title="Remove" aria-label={`Remove ${item.label}`}>×</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
