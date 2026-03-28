import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { MapView, type MapViewHandle } from '@/components/map/MapView'
import { MapSidebar } from '@/components/map/MapSidebar'
import { ReportPopup, AddReportModal } from '@/components/map/ReportModals'
import { PostCard } from '@/components/feed/PostCard'
import { ProfileHeader, TripCard } from '@/components/profile'
import { Button, Spinner } from '@/components/common'
import { useAuthStore, useFeedStore } from '@/store'
import { authApi, feedApi, usersApi } from '@/services/api'
import { realtimeService } from '@/services/realtime'
import type { Report, ReportType, User, Trip } from '@/types'

// ── MapPage ───────────────────────────────────

export function MapPage() {
  const mapViewRef                          = useRef<MapViewHandle>(null)
  const [reports, setReports]               = useState<Report[]>([])
  const [activeTypes, setActiveTypes]       = useState<ReportType[]>(['road','border','camp','fuel','mechanic','hazard'])
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [addAt, setAddAt]                   = useState<{ lat: number; lng: number } | null>(null)
  const [justCreatedId, setJustCreatedId]   = useState<string | null>(null)

  function toggleType(t: ReportType) {
    setActiveTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  }

  function handleVote(id: string, upvotes: number, downvotes: number) {
    setReports(prev => prev.map(r => r.id === id ? { ...r, upvotes, downvotes } : r))
    if (selectedReport?.id === id) setSelectedReport(prev => prev ? { ...prev, upvotes, downvotes } : null)
  }

  function handleReportCreated(report: Report) {
    setReports(prev => [report, ...prev])
    setAddAt(null)
    setJustCreatedId(report.id)
    setTimeout(() => setJustCreatedId(null), 500)
  }

  function handleReportClick(report: Report) {
    if (justCreatedId === report.id) return
    setAddAt(null)
    setSelectedReport(report)
    // Fly the map to the report's location
    mapViewRef.current?.flyTo(report.lng, report.lat)
  }

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      <MapSidebar
        reports={reports}
        activeTypes={activeTypes}
        onToggleType={toggleType}
        onReportClick={handleReportClick}
        onVote={handleVote}
      />
      <div style={{ flex: 1, position: 'relative' }}>
        <MapView
          ref={mapViewRef}
          reports={reports}
          onReportsLoad={setReports}
          onReportClick={handleReportClick}
          onMapClick={(lat, lng) => {
            setSelectedReport(null)
            setAddAt({ lat, lng })
          }}
        />
        {selectedReport && (
          <ReportPopup report={selectedReport} onClose={() => setSelectedReport(null)} />
        )}
      </div>
      {addAt && (
        <AddReportModal
          open
          lat={addAt.lat}
          lng={addAt.lng}
          onClose={() => setAddAt(null)}
          onCreated={handleReportCreated}
        />
      )}
    </div>
  )
}

// ── FeedPage ──────────────────────────────────

export function FeedPage() {
  const { posts, hasMore, isLoading, page, setPosts, appendPosts, setHasMore, setPage, setLoading } = useFeedStore()

  useEffect(() => {
    setLoading(true)
    feedApi.list({ page: 1 })
      .then(({ data }) => { setPosts(data.data); setHasMore(data.hasMore) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function loadMore() {
    if (isLoading || !hasMore) return
    const next = page + 1
    setLoading(true)
    feedApi.list({ page: next })
      .then(({ data }) => { appendPosts(data.data); setHasMore(data.hasMore); setPage(next) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  function handleVote(id: string, upvotes: number) {
    useFeedStore.getState().setPosts(
      useFeedStore.getState().posts.map(p => p.id === id ? { ...p, upvotes } : p)
    )
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
      {posts.map(p => <PostCard key={p.id} post={p} onVote={handleVote} />)}
      {isLoading && <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>}
      {hasMore && !isLoading && (
        <button onClick={loadMore} style={{ width: '100%', padding: 12, borderRadius: 8, fontSize: 13, border: '1px solid rgba(200,169,110,0.2)', background: 'transparent', color: '#C8A96E', cursor: 'pointer' }}>
          Load more
        </button>
      )}
      {!hasMore && posts.length === 0 && !isLoading && (
        <p style={{ textAlign: 'center', color: '#6A5A48', fontSize: 13, padding: 48 }}>No posts yet. Be the first!</p>
      )}
    </div>
  )
}

// ── ProfilePage ───────────────────────────────

export function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const [user, setUser]       = useState<User | null>(null)
  const [trips, setTrips]     = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!username) return
    Promise.all([usersApi.get(username), usersApi.trips(username)])
      .then(([u, t]) => { setUser(u.data); setTrips(t.data) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [username])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner size={32} /></div>
  if (!user)   return <div style={{ padding: 48, color: '#8A7A66', textAlign: 'center' }}>User not found</div>

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <ProfileHeader user={user} />
      <h2 style={{ fontSize: 13, fontWeight: 600, color: '#7A6A58', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 14 }}>Trips</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {trips.map(t => <TripCard key={t.id} trip={t} />)}
        {trips.length === 0 && <p style={{ color: '#6A5A48', fontSize: 13 }}>No trips logged yet.</p>}
      </div>
    </div>
  )
}

// ── LoginPage ─────────────────────────────────

export function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { data } = await authApi.login({ email, password })
      setAuth(data.user, data.token, data.refreshToken)
      realtimeService.connect(data.token)
      navigate('/map')
    } catch { setError('Invalid email or password') }
    finally { setLoading(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 6, fontSize: 13, border: '1px solid rgba(200,169,110,0.2)', background: 'rgba(255,255,255,0.04)', color: '#E8E0D0', boxSizing: 'border-box' }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#1C1410' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#C8A96E', marginBottom: 4 }}>PisteUp</h1>
        <p style={{ fontSize: 13, color: '#8A7A66', marginBottom: 28 }}>The social network for overland travellers</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={inp} required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={inp} required />
          {error && <p style={{ color: '#CC5555', fontSize: 12, margin: 0 }}>{error}</p>}
          <Button variant="primary" loading={loading} style={{ width: '100%', justifyContent: 'center' }}>Sign in</Button>
        </form>
        <p style={{ marginTop: 16, fontSize: 12, color: '#6A5A48', textAlign: 'center' }}>
          No account? <Link to="/register" style={{ color: '#C8A96E' }}>Create one</Link>
        </p>
      </div>
    </div>
  )
}

// ── RegisterPage ──────────────────────────────

export function RegisterPage() {
  const [form, setForm]     = useState({ username: '', email: '', password: '', displayName: '', vehicle: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { data } = await authApi.register(form)
      setAuth(data.user, data.token, data.refreshToken)
      realtimeService.connect(data.token)
      navigate('/map')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message
      setError(msg ?? 'Registration failed')
    } finally { setLoading(false) }
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 6, fontSize: 13, border: '1px solid rgba(200,169,110,0.2)', background: 'rgba(255,255,255,0.04)', color: '#E8E0D0', boxSizing: 'border-box' }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#1C1410' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#C8A96E', marginBottom: 24 }}>Join PisteUp</h1>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input placeholder="Display name" value={form.displayName} onChange={set('displayName')} style={inp} required />
          <input placeholder="Username (letters, numbers, _ .)" value={form.username} onChange={set('username')} style={inp} required />
          <input type="email" placeholder="Email" value={form.email} onChange={set('email')} style={inp} required />
          <input type="password" placeholder="Password (min 8 chars)" value={form.password} onChange={set('password')} style={inp} required />
          <input placeholder="Vehicle (optional)" value={form.vehicle} onChange={set('vehicle')} style={inp} />
          {error && <p style={{ color: '#CC5555', fontSize: 12, margin: 0 }}>{error}</p>}
          <Button variant="primary" loading={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>Create account</Button>
        </form>
        <p style={{ marginTop: 14, fontSize: 12, color: '#6A5A48', textAlign: 'center' }}>
          Already have an account? <Link to="/login" style={{ color: '#C8A96E' }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}