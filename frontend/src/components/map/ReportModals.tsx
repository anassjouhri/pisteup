import { useState } from 'react'
import { Avatar, Badge, Button, Modal } from '@/components/common'
import { formatRelative } from '@/utils/format'
import { reportsApi } from '@/services/api'
import type { Report, ReportType, ReportStatus } from '@/types'

// ── ReportPopup ───────────────────────────────

export function ReportPopup({ report, onClose }: { report: Report; onClose: () => void }) {
  const statusLabels: Record<ReportStatus, string> = { good: 'Good', warning: 'Delays', bad: 'Difficult', closed: 'Closed', unknown: 'Unknown' }
  const typeLabels: Record<ReportType, string> = { road: 'Road', border: 'Border', camp: 'Camp', fuel: 'Fuel', mechanic: 'Mechanic', hazard: 'Hazard' }

  return (
    <div style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', width: 360, background: '#261C14', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 10, zIndex: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(200,169,110,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <Badge variant={report.type} label={typeLabels[report.type]} />
          <Badge variant={report.status} label={statusLabels[report.status]} />
        </div>
        <button onClick={onClose} style={{ color: '#6A5A48', fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#D4C9B5', marginBottom: 6 }}>{report.title}</div>
        <div style={{ fontSize: 12, color: '#8A7A66', lineHeight: 1.5, marginBottom: 12 }}>{report.description}</div>
        {report.location_name && (
          <div style={{ fontSize: 11, color: '#6A5A48', marginBottom: 8 }}>📍 {report.location_name}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {report.author && <Avatar user={report.author} size="sm" />}
          <span style={{ fontSize: 11, color: '#6A5A48' }}>
            {report.author?.displayName ?? 'You'} · {formatRelative(report.created_at)}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#8A7A66' }}>↑ {report.upvotes}</span>
        </div>
      </div>
    </div>
  )
}

// ── AddReportModal ────────────────────────────

const TYPES: { value: ReportType; label: string; emoji: string }[] = [
  { value: 'road',   label: 'Road condition',  emoji: '🛤' },
  { value: 'border', label: 'Border crossing', emoji: '🛂' },
  { value: 'camp',   label: 'Campsite',        emoji: '⛺' },
  { value: 'fuel',   label: 'Fuel stop',       emoji: '⛽' },
  { value: 'hazard', label: 'Hazard',          emoji: '⚠' },
]

interface AddReportModalProps {
  open: boolean
  onClose: () => void
  lat: number
  lng: number
  onCreated: (report: Report) => void
}

export function AddReportModal({ open, onClose, lat, lng, onCreated }: AddReportModalProps) {
  const [step, setStep]     = useState(1)
  const [type, setType]     = useState<ReportType>('road')
  const [status, setStatus] = useState<ReportStatus>('unknown')
  const [title, setTitle]   = useState('')
  const [desc, setDesc]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')

  function resetAndClose() {
    setStep(1); setTitle(''); setDesc(''); setError(''); onClose()
  }

  async function handleSubmit() {
    if (!title.trim() || !desc.trim()) { setError('Title and description are required'); return }
    setLoading(true); setError('')
    try {
      const { data } = await reportsApi.create({ type, status, title: title.trim(), description: desc.trim(), lat, lng })
      onCreated(data)
      resetAndClose()
    } catch (err) {
      setError('Failed to submit report. Please try again.')
      console.error(err)
    } finally { setLoading(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 6, border: '1px solid rgba(200,169,110,0.2)', background: 'rgba(255,255,255,0.04)', color: '#E8E0D0', fontSize: 13, boxSizing: 'border-box' }

  return (
    <Modal open={open} onClose={resetAndClose} title="Add report" width={440}>
      {step === 1 && (
        <>
          <p style={{ fontSize: 12, color: '#8A7A66', marginBottom: 12 }}>What are you reporting?</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {TYPES.map(t => (
              <button key={t.value} onClick={() => { setType(t.value); setStep(2) }}
                style={{ padding: '12px 8px', borderRadius: 8, textAlign: 'center', fontSize: 13, border: '1px solid rgba(200,169,110,0.2)', background: 'rgba(200,169,110,0.05)', color: '#D4C9B5', cursor: 'pointer' }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{t.emoji}</div>
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input placeholder="Short title (e.g. 'Rosso border — delays')" value={title} onChange={e => setTitle(e.target.value)} style={inp} />
          <textarea placeholder="Describe what you found. Be specific." value={desc} onChange={e => setDesc(e.target.value)} rows={4} style={{ ...inp, resize: 'vertical' }} />
          <select value={status} onChange={e => setStatus(e.target.value as ReportStatus)} style={{ ...inp, background: '#261C14' }}>
            <option value="good">Good / passable</option>
            <option value="warning">Delays / rough</option>
            <option value="bad">Difficult / dangerous</option>
            <option value="closed">Closed</option>
            <option value="unknown">Unknown</option>
          </select>
          {error && <p style={{ color: '#CC5555', fontSize: 12, margin: 0 }}>{error}</p>}
          <div style={{ fontSize: 11, color: '#6A5A48' }}>📍 {lat.toFixed(4)}, {lng.toFixed(4)}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
            <Button variant="primary" loading={loading} onClick={handleSubmit} disabled={!title || !desc}>Submit report</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
