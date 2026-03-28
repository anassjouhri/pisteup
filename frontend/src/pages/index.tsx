import { useState, useEffect, useRef, type FormEvent } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { MapView, type MapViewHandle } from '@/components/map/MapView'
import { MapSidebar } from '@/components/map/MapSidebar'
import { ReportPopup, AddReportModal } from '@/components/map/ReportModals'
import { PostCard } from '@/components/feed/PostCard'
import { ProfileHeader, TripCard } from '@/components/profile'
import { Button, Spinner } from '@/components/common'
import { useAuthStore, useFeedStore } from '@/store'
import { authApi, feedApi, geoApi, tracksApi } from '@/services/api'
import { usersApi } from '@/services/api'
import { realtimeService } from '@/services/realtime'
import type { Report, ReportType, User, Trip } from '@/types'
import type { Track } from '@/services/api'

// ── MapPage ───────────────────────────────────

export function MapPage() {
  const mapViewRef                          = useRef<MapViewHandle>(null)
  const [reports, setReports]               = useState<Report[]>([])
  const [tracks, setTracks]                 = useState<Track[]>([])
  const [showTracks, setShowTracks]         = useState(true)
  const [activeTypes, setActiveTypes]       = useState<ReportType[]>(['road','border','camp','fuel','mechanic','hazard'])
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [addAt, setAddAt]                   = useState<{ lat: number; lng: number } | null>(null)
  const [justCreatedId, setJustCreatedId]   = useState<string | null>(null)

  // Load tracks when map moves
  async function loadTracks(swLat: number, swLng: number, neLat: number, neLng: number) {
    try {
      const { data } = await tracksApi.list({ swLat, swLng, neLat, neLng, pageSize: 50 })
      setTracks(data.data)
    } catch (err) { console.error(err) }
  }

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
    mapViewRef.current?.flyTo(report.lng, report.lat)
  }

  function handleTrackClick(track: Track) {
    mapViewRef.current?.fitTrack(track)
  }

  function handleTrackCreated(track: Track) {
    setTracks(prev => [track, ...prev])
    // Fly to the new track
    setTimeout(() => mapViewRef.current?.fitTrack(track), 300)
  }

  function handleReportsLoad(newReports: Report[]) {
    setReports(newReports)
    // Also load tracks for the current viewport
    if (mapViewRef.current) {
      // We trigger track loading via the same viewport bounds
      // The map fires moveend which calls onReportsLoad — we piggyback track loading here
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      <MapSidebar
        reports={reports}
        tracks={tracks}
        activeTypes={activeTypes}
        showTracks={showTracks}
        onToggleType={toggleType}
        onToggleTracks={() => setShowTracks(prev => !prev)}
        onReportClick={handleReportClick}
        onTrackClick={handleTrackClick}
        onVote={handleVote}
        onTrackCreated={handleTrackCreated}
      />
      <div style={{ flex: 1, position: 'relative' }}>
        <MapView
          ref={mapViewRef}
          reports={reports}
          tracks={tracks}
          showTracks={showTracks}
          onReportsLoad={setReports}
          onReportClick={handleReportClick}
          onMapClick={(lat, lng) => { setSelectedReport(null); setAddAt({ lat, lng }) }}
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

// ── Location search hook ──────────────────────

interface GeoResult { name: string; coords: { lat: number; lng: number } }

function useLocationSearch() {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<GeoResult[]>([])
  const [selected, setSelected] = useState<GeoResult | null>(null)
  const [searching, setSearching] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onChange(val: string) {
    setQuery(val)
    setSelected(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!val.trim()) { setResults([]); return }
    timerRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const { data } = await geoApi.search(val.trim())
        setResults(data.slice(0, 5))
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 400)
  }

  function pick(result: GeoResult) {
    setSelected(result)
    setQuery(result.name.split(',')[0].trim())
    setResults([])
  }

  function clear() {
    setQuery(''); setSelected(null); setResults([])
  }

  return { query, results, selected, searching, onChange, pick, clear }
}
// ── FeedPage ──────────────────────────────────

export function FeedPage() {
  const { posts, hasMore, isLoading, page, setPosts, appendPosts, setHasMore, setPage, setLoading } = useFeedStore()
  const { user } = useAuthStore()
  const [showCompose, setShowCompose] = useState(false)
  const [content, setContent]         = useState('')
  const [tags, setTags]               = useState('')
  const [posting, setPosting]         = useState(false)
  const [postError, setPostError]     = useState('')
  const loc = useLocationSearch()

  useEffect(() => {
    setLoading(true)
    feedApi.list({ page: 1 })
      .then(({ data }) => { setPosts(data.data); setHasMore(data.hasMore) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handlePost(e: FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setPosting(true); setPostError('')
    try {
      const tagList = tags.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean)
      const body: Record<string, unknown> = { content: content.trim(), tags: tagList }
      if (loc.selected) {
        body.lat          = loc.selected.coords.lat
        body.lng          = loc.selected.coords.lng
        body.locationName = loc.selected.name
      }
      const { data } = await feedApi.create(body)
      if (data && data.author) {
        useFeedStore.getState().setPosts([data, ...useFeedStore.getState().posts])
      } else {
        const { data: fresh } = await feedApi.list({ page: 1 })
        setPosts(fresh.data); setHasMore(fresh.hasMore)
      }
      setContent(''); setTags(''); loc.clear(); setShowCompose(false)
    } catch (err) {
      console.error(err)
      setPostError('Failed to post. Please try again.')
    } finally { setPosting(false) }
  }

  function loadMore() {
    if (isLoading || !hasMore) return
    const next = page + 1
    setLoading(true)
    feedApi.list({ page: next })
      .then(({ data }) => { appendPosts(data.data); setHasMore(data.hasMore); setPage(next) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 6, fontSize: 13,
    border: '1px solid rgba(200,169,110,0.2)', background: 'rgba(255,255,255,0.04)',
    color: '#E8E0D0', boxSizing: 'border-box',
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>

        {/* Compose button */}
        {!showCompose && (
          <button
            onClick={() => setShowCompose(true)}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 8, marginBottom: 20,
              border: '1px dashed rgba(200,169,110,0.3)', background: 'rgba(200,169,110,0.04)',
              color: '#8A7A66', fontSize: 13, cursor: 'pointer', textAlign: 'left',
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,169,110,0.6)'; (e.currentTarget as HTMLButtonElement).style.color = '#C8A96E' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(200,169,110,0.3)'; (e.currentTarget as HTMLButtonElement).style.color = '#8A7A66' }}
          >
            ✏️ Share a trip update, road condition, or question…
          </button>
        )}

        {/* Compose form */}
        {showCompose && (
          <form onSubmit={handlePost} style={{
            background: '#261C14', border: '1px solid rgba(200,169,110,0.2)',
            borderRadius: 8, padding: 16, marginBottom: 20,
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {/* Author row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: 'rgba(232,98,42,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color: '#E8622A', flexShrink: 0,
              }}>
                {user?.display_name?.slice(0, 2).toUpperCase() ?? 'ME'}
              </div>
              <span style={{ fontSize: 13, color: '#C8A96E', fontWeight: 500 }}>
                {user?.display_name ?? 'You'}
              </span>
            </div>

            {/* Content */}
            <textarea
              placeholder="Share a trip update, road condition, question, or experience…"
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={4}
              style={{ ...inp, resize: 'vertical' }}
              autoFocus
              required
            />

            {/* Tags */}
            <input
              placeholder="Tags — comma separated (e.g. Morocco, piste, 4x4)"
              value={tags}
              onChange={e => setTags(e.target.value)}
              style={inp}
            />

            {/* Location search */}
            <div style={{ position: 'relative' }}>
              <input
                placeholder="📍 Add location (type a place name)…"
                value={loc.query}
                onChange={e => loc.onChange(e.target.value)}
                style={{ ...inp, paddingRight: loc.selected ? 32 : 12 }}
              />
              {/* Clear button when a location is selected */}
              {loc.selected && (
                <button
                  type="button"
                  onClick={loc.clear}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: '#6A5A48', cursor: 'pointer', fontSize: 16,
                  }}
                >×</button>
              )}
              {/* Search results dropdown */}
              {loc.results.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: '#1C1410', border: '1px solid rgba(200,169,110,0.25)',
                  borderRadius: 6, marginTop: 2, overflow: 'hidden',
                }}>
                  {loc.results.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => loc.pick(r)}
                      style={{
                        display: 'block', width: '100%', padding: '8px 12px', textAlign: 'left',
                        fontSize: 12, color: '#C0B0A0', background: 'none', border: 'none',
                        cursor: 'pointer', borderBottom: i < loc.results.length - 1 ? '1px solid rgba(200,169,110,0.1)' : 'none',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(200,169,110,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      📍 {r.name}
                    </button>
                  ))}
                </div>
              )}
              {loc.searching && (
                <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#6A5A48' }}>
                  searching…
                </div>
              )}
            </div>

            {/* Selected location confirmation */}
            {loc.selected && (
              <div style={{ fontSize: 11, color: '#7AB050', padding: '4px 0' }}>
                ✓ Post will be pinned to: {loc.selected.name}
              </div>
            )}

            {postError && <p style={{ color: '#CC5555', fontSize: 12, margin: 0 }}>{postError}</p>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <Button variant="ghost" onClick={() => { setShowCompose(false); setContent(''); setTags(''); loc.clear(); setPostError('') }}>
                Cancel
              </Button>
              <Button variant="primary" loading={posting} disabled={!content.trim()}>
                Post
              </Button>
            </div>
          </form>
        )}

        {posts.map(p => <PostCard key={p.id} post={p} />)}

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spinner />
          </div>
        )}

        {hasMore && !isLoading && (
          <button onClick={loadMore} style={{
            width: '100%', padding: 12, borderRadius: 8, fontSize: 13,
            border: '1px solid rgba(200,169,110,0.2)', background: 'transparent',
            color: '#C8A96E', cursor: 'pointer',
          }}>
            Load more
          </button>
        )}

        {!hasMore && posts.length === 0 && !isLoading && (
          <p style={{ textAlign: 'center', color: '#6A5A48', fontSize: 13, padding: 48 }}>
            No posts yet. Be the first!
          </p>
        )}
      </div>
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
    <div style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
        <ProfileHeader user={user} />
        <h2 style={{ fontSize: 13, fontWeight: 600, color: '#7A6A58', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 14 }}>Trips</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {trips.map(t => <TripCard key={t.id} trip={t} />)}
          {trips.length === 0 && <p style={{ color: '#6A5A48', fontSize: 13 }}>No trips logged yet.</p>}
        </div>
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