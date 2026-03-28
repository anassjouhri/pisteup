import { Avatar } from '@/components/common'
import { formatKm, formatDate } from '@/utils/format'
import type { User, Trip } from '@/types'

export function ProfileHeader({ user }: { user: User }) {
  const stats = [
    { num: formatKm(user.km_logged),       label: 'km logged' },
    { num: user.countries_visited,          label: 'countries' },
    { num: user.report_count ?? 0,          label: 'reports' },
    { num: user.trust_score.toFixed(1),     label: 'trust score' },
  ]
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ height: 100, background: '#1A1008', borderRadius: '8px 8px 0 0' }} />
      <div style={{ background: '#261C14', border: '1px solid rgba(200,169,110,0.15)', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: '40px 18px 18px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: -28, left: 18 }}>
          <Avatar user={user} size="lg" />
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#E8E0D0', lineHeight: 1 }}>{user.display_name}</div>
        <div style={{ fontSize: 12, color: '#7A6A58', margin: '3px 0 8px' }}>
          @{user.username}{user.vehicle ? ` · ${user.vehicle}` : ''}
        </div>
        {user.bio && <p style={{ fontSize: 12, color: '#8A7A66', lineHeight: 1.5, maxWidth: 500, marginBottom: 12 }}>{user.bio}</p>}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {stats.map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#C8A96E', lineHeight: 1 }}>{s.num}</div>
              <div style={{ fontSize: 11, color: '#7A6A58', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function TripCard({ trip }: { trip: Trip }) {
  return (
    <div style={{ background: '#261C14', border: '1px solid rgba(200,169,110,0.15)', borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}>
      <div style={{ height: 80, background: '#1A1008', position: 'relative' }}>
        <svg width="100%" height="80" viewBox="0 0 300 80">
          <path d="M10 60 Q75 30 150 50 Q225 70 290 35" stroke="#C8A96E" strokeWidth="1.5" fill="none" strokeDasharray="6 4" opacity="0.5" />
        </svg>
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#D4C9B5', marginBottom: 3 }}>{trip.title}</div>
        <div style={{ fontSize: 11, color: '#7A6A58' }}>
          {formatKm(trip.distance_km)} · {formatDate(trip.start_date)}
          {trip.end_date ? ` → ${formatDate(trip.end_date)}` : ' (ongoing)'}
        </div>
        {trip.country_codes.length > 0 && (
          <div style={{ fontSize: 11, color: '#6A5A48', marginTop: 2 }}>{trip.country_codes.join(', ')}</div>
        )}
      </div>
    </div>
  )
}
