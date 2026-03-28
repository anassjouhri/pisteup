// ─────────────────────────────────────────────
// PisteUp — API Types
// All fields match exact backend/PostgreSQL column names (snake_case)
// The nested `author` object uses camelCase because it's built
// with json_build_object aliases in the SQL queries.
// ─────────────────────────────────────────────

export interface AuthorRef {
  id: string
  username: string
  displayName: string   // aliased in json_build_object
  avatarUrl: string | null
  trustScore: number
}

export interface User {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  vehicle: string | null
  home_country: string | null
  km_logged: number
  countries_visited: number
  trust_score: number
  created_at: string
  report_count?: number
  followers_count?: number
  following_count?: number
  is_following?: boolean
}

export type ReportType   = 'road' | 'border' | 'camp' | 'fuel' | 'mechanic' | 'hazard'
export type ReportStatus = 'good' | 'warning' | 'bad' | 'closed' | 'unknown'

export interface Report {
  id: string
  type: ReportType
  status: ReportStatus
  title: string
  description: string
  lat: number
  lng: number
  location_name: string | null
  country_code: string | null
  author: AuthorRef
  upvotes: number
  downvotes: number
  tags: string[]
  vehicle_types: string[]
  photos: string[]
  expires_at: string | null
  created_at: string
  updated_at: string
  user_vote?: 1 | -1 | null
}

export interface Post {
  id: string
  content: string
  photos: string[]
  lat: number | null
  lng: number | null
  location_name: string | null
  country_code: string | null
  tags: string[]
  upvotes: number
  created_at: string
  comment_count: number
  author: AuthorRef
  user_vote?: 1 | -1 | null
}

export interface Comment {
  id: string
  post_id: string
  content: string
  upvotes: number
  created_at: string
  author: Pick<AuthorRef, 'id' | 'username' | 'displayName' | 'avatarUrl'>
}

export interface Trip {
  id: string
  user_id: string
  title: string
  description: string | null
  start_date: string
  end_date: string | null
  is_active: boolean
  distance_km: number
  country_codes: string[]
  cover_photo_url: string | null
  created_at: string
  waypoints?: TripWaypoint[]
}

export interface TripWaypoint {
  id: string
  trip_id: string
  lat: number
  lng: number
  location_name: string | null
  arrived_at: string
  note: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  page: number
  pageSize: number
  hasMore: boolean
}

export interface AuthResponse {
  user: User
  token: string
  refreshToken: string
}
