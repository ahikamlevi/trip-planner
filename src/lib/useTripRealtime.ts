import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

// Tables whose changes should refresh a trip's views. Subscriptions are
// unfiltered; RLS ensures a client only receives events for rows it can see,
// and the consumer's reload() re-fetches through RLS-protected queries.
const TABLES = ['trips', 'trip_members', 'places', 'areas', 'days', 'stops', 'budget_entries']

/**
 * Calls `onChange` (debounced) whenever any trip data changes in the database —
 * from this user or anyone else editing the same trip. Powers live shared editing.
 */
export function useTripRealtime(tripId: string | undefined, onChange: () => void) {
  const cb = useRef(onChange)
  cb.current = onChange

  useEffect(() => {
    if (!tripId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const ping = () => {
      clearTimeout(timer)
      timer = setTimeout(() => cb.current(), 200)
    }

    const channel = supabase.channel(`trip-${tripId}`)
    for (const table of TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, ping)
    }
    channel.subscribe()

    return () => {
      clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [tripId])
}
