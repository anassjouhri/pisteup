import { reportsApi } from '@/services/api'
import { formatRelative } from '@/utils/format'
import { Avatar, Badge } from '@/components/common'
import type { Report, ReportType, ReportStatus } from '@/types'

const TYPE_LABEL: Record<ReportType, string> = {
  road: 'Road', border: 'Border', camp: 'Camp',
  fuel: 'Fuel', mechanic: 'Mechanic', hazard: 'Hazard',
}

const STATUS_LABEL: Record<ReportStatus, string> = {
  good: 'Good', warning: 'Delays', bad: 'Difficult',
  closed: 'Closed', unknown: 'Unknown',
}

interface ReportCardProps {
  report: Report
  compact?: boolean
  onClick?: () => void
  onVote?: (id: string, upvotes: number, downvotes: number) => void
}

export function ReportCard({ report, compact = false, onClick, onVote }: ReportCardProps) {
  async function handleVote(value: 1 | -1, e: React.MouseEvent) {
    e.stopPropagation()
    const next = report.user_vote === value ? 0 : value
    try {
      const { data } = await reportsApi.vote(report.id, next as 1 | -1 | 0)
      onVote?.(report.id, data.upvotes, data.downvotes)
    } catch (err) { console.error('Vote failed:', err) }
  }

  return (
    <div onClick={onClick} style={{ padding: 12, borderBottom: '1px solid rgba(200,169,110,0.12)', cursor: onClick ? 'pointer' : 'default', transition: 'background 0.12s' }}
      onMouseEnter={e => onClick && ((e.currentTarget as HTMLDivElement).style.background = 'rgba(200,169,110,0.04)')}
      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(report.type), flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: '#D4C9B5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.title}</span>
        <Badge variant={report.status} label={STATUS_LABEL[report.status]} />
      </div>

      {!compact && (
        <p style={{ fontSize: 12, color: '#8A7A66', lineHeight: 1.5, marginBottom: 8, paddingLeft: 16 }}>{report.description}</p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16 }}>
        <span style={{ fontSize: 11, color: '#6A5A48' }}>
          {TYPE_LABEL[report.type]} · {formatRelative(report.created_at)}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={(e) => handleVote(1, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: report.user_vote === 1 ? '#7AB050' : '#6A5A48', padding: '2px 6px' }}>
            ↑ {report.upvotes}
          </button>
          <button onClick={(e) => handleVote(-1, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: report.user_vote === -1 ? '#E8622A' : '#6A5A48', padding: '2px 6px' }}>
            ↓
          </button>
        </div>
      </div>
    </div>
  )
}

function dotColor(type: ReportType): string {
  const colors: Record<ReportType, string> = {
    road: '#5B8FA8', border: '#E8622A', camp: '#7AB050',
    fuel: '#C8A96E', mechanic: '#8B6F47', hazard: '#CC3333',
  }
  return colors[type]
}
