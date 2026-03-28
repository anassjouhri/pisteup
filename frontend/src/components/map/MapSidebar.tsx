import { useState } from 'react'
import { ReportCard } from '@/components/reports/ReportCard'
import { UploadTrackModal } from '@/components/tracks/UploadTrackModal'
import { formatRelative } from '@/utils/format'
import type { Report, ReportType } from '@/types'
import type { Track } from '@/services/api'

const REPORT_CHIPS: { type: ReportType; label: string; color: string }[] = [
  { type: 'road',   label: 'Roads',   color: '#5B8FA8' },
  { type: 'border', label: 'Borders', color: '#E8622A' },
  { type: 'camp',   label: 'Camps',   color: '#7AB050' },
  { type: 'fuel',   label: 'Fuel',    color: '#C8A96E' },
  { type: 'hazard', label: 'Hazards', color: '#CC3333' },
]

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: '#7AB050', moderate: '#C8A96E', hard: '#E8622A', extreme: '#CC3333',
}

interface Props {
  reports:       Report[]
  tracks:        Track[]
  activeTypes:   ReportType[]
  showTracks:    boolean
  onToggleType:  (t: ReportType) => void
  onToggleTracks: () => void
  onReportClick: (r: Report) => void
  onTrackClick:  (t: Track) => void
  onVote:        (id: string, upvotes: number, downvotes: number) => void
  onTrackCreated:(t: Track) => void
}

type Tab = 'reports' | 'tracks'

export function MapSidebar({
  reports, tracks, activeTypes, showTracks,
  onToggleType, onToggleTracks, onReportClick, onTrackClick,
  onVote, onTrackCreated,
}: Props) {
  const [tab, setTab]               = useState<Tab>('reports')
  const [showUpload, setShowUpload] = useState(false)
  const filtered = reports.filter(r => activeTypes.includes(r.type))

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600,
    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
    background: active ? 'rgba(200,169,110,0.12)' : 'transparent',
    color: active ? '#C8A96E' : '#6A5A48',
    borderBottom: active ? '2px solid #C8A96E' : '2px solid transparent',
  })

  return (
    <div style={{ width: 280, background: '#261C14', borderRight: '1px solid rgba(200,169,110,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(200,169,110,0.12)' }}>
        <button style={tabStyle(tab === 'reports')} onClick={() => setTab('reports')}>📍 Reports</button>
        <button style={tabStyle(tab === 'tracks')}  onClick={() => setTab('tracks')}>🗺 Tracks</button>
      </div>

      {tab === 'reports' && (
        <>
          {/* Search */}
          <div style={{ padding: 10, borderBottom: '1px solid rgba(200,169,110,0.1)' }}>
            <input placeholder="Search location, route…" style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 6, padding: '7px 12px', color: '#E8E0D0', fontSize: 13, boxSizing: 'border-box' }} />
          </div>

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: 5, padding: '8px 10px', flexWrap: 'wrap', borderBottom: '1px solid rgba(200,169,110,0.1)' }}>
            {REPORT_CHIPS.map(c => (
              <button key={c.type} onClick={() => onToggleType(c.type)} style={{
                padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                border: `1px solid ${c.color}44`,
                background: activeTypes.includes(c.type) ? `${c.color}22` : 'transparent',
                color: activeTypes.includes(c.type) ? c.color : '#6A5A48', cursor: 'pointer',
              }}>
                {c.label}
              </button>
            ))}
          </div>

          {/* Report list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <p style={{ padding: 16, color: '#6A5A48', fontSize: 12, textAlign: 'center' }}>
                No reports in this area.<br />Click the map to add one!
              </p>
            ) : (
              filtered.map(r => (
                <ReportCard key={r.id} report={r} compact onClick={() => onReportClick(r)} onVote={onVote} />
              ))
            )}
          </div>
        </>
      )}

      {tab === 'tracks' && (
        <>
          {/* Tracks header */}
          <div style={{ padding: '10px', borderBottom: '1px solid rgba(200,169,110,0.1)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setShowUpload(true)}
              style={{
                flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: '#E8622A', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >
              + Upload GPX
            </button>
            <button
              onClick={onToggleTracks}
              title={showTracks ? 'Hide tracks on map' : 'Show tracks on map'}
              style={{
                padding: '7px 10px', borderRadius: 6, fontSize: 12,
                border: `1px solid ${showTracks ? '#C8A96E' : 'rgba(200,169,110,0.2)'}`,
                background: showTracks ? 'rgba(200,169,110,0.12)' : 'transparent',
                color: showTracks ? '#C8A96E' : '#6A5A48', cursor: 'pointer',
              }}
            >
              {showTracks ? '👁 Visible' : '👁 Hidden'}
            </button>
          </div>

          {/* Track list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tracks.length === 0 ? (
              <p style={{ padding: 16, color: '#6A5A48', fontSize: 12, textAlign: 'center' }}>
                No tracks in this area.<br />Upload a GPX to share your route!
              </p>
            ) : (
              tracks.map(t => (
                <TrackCard key={t.id} track={t} onClick={() => onTrackClick(t)} />
              ))
            )}
          </div>
        </>
      )}

      <UploadTrackModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onCreated={(t) => { onTrackCreated(t); setShowUpload(false) }}
      />
    </div>
  )
}

function TrackCard({ track, onClick }: { track: Track; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: 12, borderBottom: '1px solid rgba(200,169,110,0.1)', cursor: 'pointer' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(200,169,110,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: '#D4C9B5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          🗺 {track.title}
        </span>
        {track.difficulty && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: `${DIFFICULTY_COLOR[track.difficulty]}22`, color: DIFFICULTY_COLOR[track.difficulty] }}>
            {track.difficulty}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#6A5A48', display: 'flex', gap: 10 }}>
        <span>{track.distance_km} km</span>
        {track.elevation_gain_m ? <span>+{track.elevation_gain_m}m</span> : null}
        {track.surface_type && <span>{track.surface_type}</span>}
      </div>
      <div style={{ fontSize: 11, color: '#5A4A38', marginTop: 3 }}>
        {track.author.displayName} · {formatRelative(track.created_at)}
      </div>
    </div>
  )
}