// Hand-authored to match supabase/migrations/0001_init.sql.
// Once the Supabase CLI is set up you can regenerate this with:
//   supabase gen types typescript --project-id <ref> > src/lib/database.types.ts

export type PlaceCategory =
  | 'food'
  | 'cafe'
  | 'bar'
  | 'sight'
  | 'museum'
  | 'outdoors'
  | 'beach'
  | 'hotel'
  | 'shopping'
  | 'transport'
  | 'pharmacy'
  | 'hospital'
  | 'police'
  | 'other'
export type TripRole = 'owner' | 'editor'

export interface Database {
  public: {
    Views: Record<string, never>
    CompositeTypes: Record<string, never>
    Tables: {
      profiles: {
        Row: {
          id: string
          display_name: string | null
          email: string | null
          dietary_restrictions: string[]
          dietary_note: string | null
          created_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          email?: string | null
          dietary_restrictions?: string[]
          dietary_note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          email?: string | null
          dietary_restrictions?: string[]
          dietary_note?: string | null
          created_at?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          id: string
          name: string
          country: string | null
          start_date: string | null
          end_date: string | null
          owner_id: string
          currency: string
          notes: string | null
          cover_emoji: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          country?: string | null
          start_date?: string | null
          end_date?: string | null
          owner_id: string
          currency?: string
          notes?: string | null
          cover_emoji?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          country?: string | null
          start_date?: string | null
          end_date?: string | null
          owner_id?: string
          currency?: string
          notes?: string | null
          cover_emoji?: string | null
          created_at?: string
        }
        Relationships: []
      }
      trip_members: {
        Row: { trip_id: string; user_id: string; role: TripRole; created_at: string }
        Insert: { trip_id: string; user_id: string; role?: TripRole; created_at?: string }
        Update: { trip_id?: string; user_id?: string; role?: TripRole; created_at?: string }
        Relationships: []
      }
      places: {
        Row: {
          id: string
          trip_id: string
          name: string
          lat: number | null
          lng: number | null
          category: PlaceCategory
          category_other: string | null
          google_place_id: string | null
          notes: string | null
          opening_hours: string | null
          dietary_notes: string | null
          color: string | null
          city: string | null
          est_cost: number | null
          scheduled: boolean
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          name: string
          lat?: number | null
          lng?: number | null
          category?: PlaceCategory
          category_other?: string | null
          google_place_id?: string | null
          notes?: string | null
          opening_hours?: string | null
          dietary_notes?: string | null
          color?: string | null
          city?: string | null
          est_cost?: number | null
          scheduled?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          name?: string
          lat?: number | null
          lng?: number | null
          category?: PlaceCategory
          category_other?: string | null
          google_place_id?: string | null
          notes?: string | null
          opening_hours?: string | null
          dietary_notes?: string | null
          color?: string | null
          city?: string | null
          est_cost?: number | null
          scheduled?: boolean
          created_at?: string
        }
        Relationships: []
      }
      route_cache: {
        Row: {
          id: string
          origin: string
          dest: string
          mode: string
          distance: number | null
          duration: number | null
          fetched_at: string
        }
        Insert: {
          id?: string
          origin: string
          dest: string
          mode: string
          distance?: number | null
          duration?: number | null
          fetched_at?: string
        }
        Update: {
          id?: string
          origin?: string
          dest?: string
          mode?: string
          distance?: number | null
          duration?: number | null
          fetched_at?: string
        }
        Relationships: []
      }
      areas: {
        Row: { id: string; trip_id: string; name: string; sort_order: number; created_at: string }
        Insert: { id?: string; trip_id: string; name: string; sort_order?: number; created_at?: string }
        Update: { id?: string; trip_id?: string; name?: string; sort_order?: number; created_at?: string }
        Relationships: []
      }
      days: {
        Row: { id: string; trip_id: string; date: string; area_id: string | null; note: string | null; created_at: string }
        Insert: { id?: string; trip_id: string; date: string; area_id?: string | null; note?: string | null; created_at?: string }
        Update: { id?: string; trip_id?: string; date?: string; area_id?: string | null; note?: string | null; created_at?: string }
        Relationships: []
      }
      stops: {
        Row: {
          id: string
          day_id: string
          place_id: string
          sort_order: number
          arrival_time: string | null
          duration_min: number | null
          cost: number | null
          reminder_min: number | null
          travel_mode: string | null
          travel_min: number | null
          travel_dist_m: number | null
          travel_note: string | null
          travel_cost: number | null
          created_at: string
        }
        Insert: {
          id?: string
          day_id: string
          place_id: string
          sort_order?: number
          arrival_time?: string | null
          duration_min?: number | null
          cost?: number | null
          reminder_min?: number | null
          travel_mode?: string | null
          travel_min?: number | null
          travel_dist_m?: number | null
          travel_note?: string | null
          travel_cost?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          day_id?: string
          place_id?: string
          sort_order?: number
          arrival_time?: string | null
          duration_min?: number | null
          cost?: number | null
          reminder_min?: number | null
          travel_mode?: string | null
          travel_min?: number | null
          travel_dist_m?: number | null
          travel_note?: string | null
          travel_cost?: number | null
          created_at?: string
        }
        Relationships: []
      }
      packing_items: {
        Row: { id: string; trip_id: string; label: string; packed: boolean; sort_order: number; created_at: string }
        Insert: { id?: string; trip_id: string; label: string; packed?: boolean; sort_order?: number; created_at?: string }
        Update: { id?: string; trip_id?: string; label?: string; packed?: boolean; sort_order?: number; created_at?: string }
        Relationships: []
      }
      budget_entries: {
        Row: {
          id: string
          trip_id: string
          area_id: string | null
          day_id: string | null
          category: string
          amount: number
          currency: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          trip_id: string
          area_id?: string | null
          day_id?: string | null
          category: string
          amount: number
          currency?: string
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          trip_id?: string
          area_id?: string | null
          day_id?: string | null
          category?: string
          amount?: number
          currency?: string
          note?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Functions: {
      invite_member_by_email: {
        Args: { _trip_id: string; _email: string }
        Returns: string
      }
    }
    Enums: {
      place_category: PlaceCategory
      trip_role: TripRole
    }
  }
}

export type InviteResult = 'added' | 'already_member' | 'no_account' | 'not_owner'

export type Trip = Database['public']['Tables']['trips']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type TripMember = Database['public']['Tables']['trip_members']['Row']
export type Place = Database['public']['Tables']['places']['Row']
export type Area = Database['public']['Tables']['areas']['Row']
export type Day = Database['public']['Tables']['days']['Row']
export type Stop = Database['public']['Tables']['stops']['Row']
export type BudgetEntry = Database['public']['Tables']['budget_entries']['Row']
export type PackingItem = Database['public']['Tables']['packing_items']['Row']
