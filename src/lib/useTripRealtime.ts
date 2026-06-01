import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

// Tables whose changes should refresh a trip's views. Subscriptions are
// unfiltered; RLS ensures a client only receives events for rows it can see,
// and the consumer's reload() re-fetches through RLS-protected queries.
const TABLES = ['trips', 'trip_members', 'places', 'areas', 'days', 'stops', 'budget_entries', 'packing_items']

// Each hook instance gets a unique channel topic so two subscribers (e.g. the
// trip page + the active tab) never collide on the same topic name.
let channelSeq = 0

/**
 * Calls `onChange` (debounced) whenever any trip data changes in the database —
 * from this user or anyone else editing the same trip. Powers live shared editing.
 *
 * Defensive by design: any failure in realtime setup is logged, never thrown, so
 * a misconfigured Realtime publication can't blank the app.
 */
export function useTripRealtime(tripId: string | undefined, onChange: () => void) {
  const cb = useRef(onChange)
  cb.current = onChange

  useEffect(() => {
    if (!tripId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let channel: ReturnType<typeof supabase.channel> | undefined

    try {
      const ping = () => {
        clearTimeout(timer)
        timer = setTimeout(() => cb.current(), 200)
      }
      channel = supabase.channel(`trip-${tripId}-${++channelSeq}`)
      for (const table of TABLES) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, ping)
      }
      channel.subscribe()
    } catch (err) {
      console.error('Realtime setup failed (live sync disabled):', err)
    }

    return () => {
      clearTimeout(timer)
      if (channel) {
        try {
          void supabase.removeChannel(channel)
        } catch {
          /* ignore */
        }
      }
    }
  }, [tripId])
}
