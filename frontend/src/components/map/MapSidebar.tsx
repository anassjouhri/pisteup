import { ReportCard } from '@/components/reports/ReportCard'
import type { Report, ReportType } from '@/types'

const CHIPS: { type: ReportType; label: string; color: string }[] = [
  { type: 'road',   label: 'Roads',   color: '#5B8FA8' },
  { type: 'border', label: 'Borders', color: '#E8622A' },
  { type: 'camp',   label: 'Camps',   color: '#7AB050' },
  { type: 'fuel',   label: 'Fuel',    color: '#C8A96E' },
]

interface MapSidebarProps {
  reports: Report[]
  activeTypes: ReportType[]
  onToggleType: (t: ReportType) => void
  onReportClick: (r: Report) => void
  onVote: (id: string, upvotes: number, downvotes: number) => void
}

export function MapSidebar({ reports, activeTypes, onToggleType, onReportClick, onVote }: MapSidebarProps) {
  const filtered = reports.filter(r => activeTypes.includes(r.type))

  return (
    <div style={{ width: 280, background: '#261C14', borderRight: '1px solid rgba(200,169,110,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ padding: 10, borderBottom: '1px solid rgba(200,169,110,0.1)' }}>
        <input placeholder="Search location, route…" style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 6, padding: '7px 12px', color: '#E8E0D0', fontSize: 13, boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', flexWrap: 'wrap', borderBottom: '1px solid rgba(200,169,110,0.1)' }}>
        {CHIPS.map(c => (
          <button key={c.type} onClick={() => onToggleType(c.type)} style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: `1px solid ${c.color}44`, background: activeTypes.includes(c.type) ? `${c.color}22` : 'transparent', color: activeTypes.includes(c.type) ? c.color : '#6A5A48', cursor: 'pointer', transition: 'all 0.15s' }}>
            {c.label}
          </button>
        ))}
      </div>
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
    </div>
  )
}
