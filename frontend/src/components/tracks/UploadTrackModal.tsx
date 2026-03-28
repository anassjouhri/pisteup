import { useState, useRef } from 'react'
import { Modal, Button } from '@/components/common'
import { tracksApi, type SurfaceType, type Difficulty, type Track } from '@/services/api'

const SURFACE_TYPES: { value: SurfaceType; label: string }[] = [
  { value: 'paved',    label: '🛣 Paved'       },
  { value: 'unpaved',  label: '🛤 Unpaved'     },
  { value: 'gravel',   label: '⬛ Gravel'      },
  { value: 'sand',     label: '🏜 Sand'        },
  { value: 'offroad',  label: '🌿 Off-road'    },
  { value: 'mud',      label: '💧 Mud'         },
  { value: 'mixed',    label: '🔀 Mixed'       },
]

const DIFFICULTIES: { value: Difficulty; label: string; color: string }[] = [
  { value: 'easy',     label: 'Easy',     color: '#7AB050' },
  { value: 'moderate', label: 'Moderate', color: '#C8A96E' },
  { value: 'hard',     label: 'Hard',     color: '#E8622A' },
  { value: 'extreme',  label: 'Extreme',  color: '#CC3333' },
]

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (track: Track) => void
}

interface Preview {
  name:           string
  pointCount:     number
  distanceKm:     number
  elevationGainM: number
  raw:            string
}

export function UploadTrackModal({ open, onClose, onCreated }: Props) {
  const fileRef               = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [title, setTitle]     = useState('')
  const [desc, setDesc]       = useState('')
  const [surface, setSurface] = useState<SurfaceType | ''>('')
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('')
  const [isPublic, setIsPublic]     = useState(true)
  const [uploading, setUploading]   = useState(false)
  const [error, setError]           = useState('')
  const [dragOver, setDragOver]     = useState(false)

  function resetAndClose() {
    setPreview(null); setTitle(''); setDesc('')
    setSurface(''); setDifficulty('')
    setError(''); setUploading(false)
    onClose()
  }

  function parsePreview(xml: string): Preview | null {
    try {
        const nameMatch = xml.match(/<name[^>]*>([\s\S]*?)<\/name>/i)
        // More flexible regex — handles any order of lat/lon attributes
        const trkpts = [...xml.matchAll(/<trkpt[^>]+>/gi)]
        const points = trkpts.map(m => {
        const latMatch = m[0].match(/lat="([^"]+)"/i)
        const lonMatch = m[0].match(/lon="([^"]+)"/i)
        if (!latMatch || !lonMatch) return null
        return { lat: parseFloat(latMatch[1]), lng: parseFloat(lonMatch[1]) }
        }).filter((p): p is { lat: number; lng: number } => p !== null && !isNaN(p.lat) && !isNaN(p.lng))

        if (points.length < 2) return null

        let dist = 0
        for (let i = 1; i < points.length; i++) {
        const R = 6371
        const dLat = (points[i].lat - points[i-1].lat) * Math.PI / 180
        const dLng = (points[i].lng - points[i-1].lng) * Math.PI / 180
        const a = Math.sin(dLat/2)**2 + Math.cos(points[i-1].lat*Math.PI/180) * Math.cos(points[i].lat*Math.PI/180) * Math.sin(dLng/2)**2
        dist += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
        }

        const eles = [...xml.matchAll(/<ele>([\s\S]*?)<\/ele>/gi)].map(m => parseFloat(m[1])).filter(n => !isNaN(n))
        let gain = 0
        for (let i = 1; i < eles.length; i++) { if (eles[i] > eles[i-1]) gain += eles[i] - eles[i-1] }

        return {
        name:           nameMatch?.[1]?.trim().replace(/<[^>]*>/g, '') ?? 'Unnamed track',
        pointCount:     points.length,
        distanceKm:     Math.round(dist * 10) / 10,
        elevationGainM: Math.round(gain),
        raw:            xml,
        }
    } catch { return null }
  }

  function handleFile(file: File) {
    setError('')
    if (!file.name.endsWith('.gpx')) { setError('Please select a .gpx file'); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      const xml = e.target?.result as string
      const p = parsePreview(xml)
      if (!p) { setError('Could not read GPX file — make sure it contains track points'); return }
      setPreview(p)
      setTitle(p.name)
    }
    reader.readAsText(file)
  }

  function onFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  async function handleUpload() {
    if (!preview || !title.trim()) return
    setUploading(true); setError('')
    try {
      const { data } = await tracksApi.upload({
        gpxContent:  preview.raw,
        title:       title.trim(),
        description: desc.trim() || undefined,
        surfaceType: surface || undefined,
        difficulty:  difficulty || undefined,
        isPublic,
      })
      onCreated(data)
      resetAndClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      setError(msg ?? 'Upload failed. Please try again.')
    } finally { setUploading(false) }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 6, fontSize: 13,
    border: '1px solid rgba(200,169,110,0.2)', background: 'rgba(255,255,255,0.04)',
    color: '#E8E0D0', boxSizing: 'border-box',
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Share a track" width={480}>
      {!preview ? (
        // ── Drop zone ──
        <div>
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            style={{
              border: `2px dashed ${dragOver ? '#C8A96E' : 'rgba(200,169,110,0.3)'}`,
              borderRadius: 10, padding: '40px 20px', textAlign: 'center',
              cursor: 'pointer', transition: 'border-color 0.15s',
              background: dragOver ? 'rgba(200,169,110,0.05)' : 'transparent',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗺</div>
            <div style={{ fontSize: 14, color: '#C8A96E', fontWeight: 600, marginBottom: 6 }}>
              Drop your GPX file here
            </div>
            <div style={{ fontSize: 12, color: '#6A5A48' }}>
              or click to browse · .gpx files only
            </div>
          </div>
          <input ref={fileRef} type="file" accept=".gpx" onChange={onFileInput} style={{ display: 'none' }} />
          {error && <p style={{ color: '#CC5555', fontSize: 12, marginTop: 10 }}>{error}</p>}
        </div>
      ) : (
        // ── Preview + metadata form ──
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Track stats */}
          <div style={{
            background: 'rgba(200,169,110,0.06)', borderRadius: 8,
            padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
          }}>
            <Stat label="Distance"  value={`${preview.distanceKm} km`} />
            <Stat label="Elevation" value={preview.elevationGainM > 0 ? `+${preview.elevationGainM} m` : '—'} />
            <Stat label="Points"    value={preview.pointCount.toLocaleString()} />
          </div>

          {/* Title */}
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Track title" style={inp} />

          {/* Description */}
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the route — surface conditions, difficulty, tips…" rows={3} style={{ ...inp, resize: 'vertical' }} />

          {/* Surface type */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SURFACE_TYPES.map(s => (
              <button key={s.value} type="button" onClick={() => setSurface(surface === s.value ? '' : s.value)}
                style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 12,
                  border: `1px solid ${surface === s.value ? '#C8A96E' : 'rgba(200,169,110,0.2)'}`,
                  background: surface === s.value ? 'rgba(200,169,110,0.15)' : 'transparent',
                  color: surface === s.value ? '#C8A96E' : '#6A5A48', cursor: 'pointer',
                }}
              >{s.label}</button>
            ))}
          </div>

          {/* Difficulty */}
          <div style={{ display: 'flex', gap: 6 }}>
            {DIFFICULTIES.map(d => (
              <button key={d.value} type="button" onClick={() => setDifficulty(difficulty === d.value ? '' : d.value)}
                style={{
                  flex: 1, padding: '6px 4px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  border: `1px solid ${difficulty === d.value ? d.color : 'rgba(200,169,110,0.2)'}`,
                  background: difficulty === d.value ? `${d.color}22` : 'transparent',
                  color: difficulty === d.value ? d.color : '#6A5A48', cursor: 'pointer',
                }}
              >{d.label}</button>
            ))}
          </div>

          {/* Public toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8A7A66', cursor: 'pointer' }}>
            <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
            Share publicly with the community
          </label>

          {error && <p style={{ color: '#CC5555', fontSize: 12, margin: 0 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
            <Button variant="ghost" onClick={() => setPreview(null)}>← Change file</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="ghost" onClick={resetAndClose}>Cancel</Button>
              <Button variant="primary" loading={uploading} onClick={handleUpload} disabled={!title.trim()}>
                Share track
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#C8A96E' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6A5A48', marginTop: 2 }}>{label}</div>
    </div>
  )
}