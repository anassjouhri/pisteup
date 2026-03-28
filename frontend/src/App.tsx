import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from '@/store'
import { authApi } from '@/services/api'
import { realtimeService } from '@/services/realtime'
import { MapPage, FeedPage, ProfilePage, LoginPage, RegisterPage } from '@/pages'
import './styles/globals.css'

function Nav() {
  const { user, clearAuth } = useAuthStore()
  return (
    <nav style={{ height: 44, background: '#120D09', borderBottom: '1px solid rgba(200,169,110,0.15)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 24, flexShrink: 0 }}>
      <a href="/map" style={{ fontWeight: 700, fontSize: 16, color: '#C8A96E', letterSpacing: '0.05em', textDecoration: 'none' }}>PISTEUP</a>
      <a href="/map"  style={{ fontSize: 13, color: '#8A7A66', textDecoration: 'none' }}>Map</a>
      <a href="/feed" style={{ fontSize: 13, color: '#8A7A66', textDecoration: 'none' }}>Feed</a>
      {user && <a href={`/u/${user.username}`} style={{ fontSize: 13, color: '#8A7A66', textDecoration: 'none' }}>{user.display_name}</a>}
      <div style={{ marginLeft: 'auto' }}>
        <button onClick={() => { realtimeService.disconnect(); clearAuth(); window.location.href = '/login' }}
          style={{ fontSize: 12, color: '#6A5A48', background: 'none', border: 'none', cursor: 'pointer' }}>
          Sign out
        </button>
      </div>
    </nav>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#1C1410' }}>
      <Nav />
      <div style={{ flex: 1, overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('pisteup_token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { token, setAuth } = useAuthStore()

  // Rehydrate user on refresh
  useEffect(() => {
    const savedToken = localStorage.getItem('pisteup_token')
    if (savedToken && !token) {
      authApi.me()
        .then(({ data }) => {
          const refresh = localStorage.getItem('pisteup_refresh') ?? ''
          setAuth(data, savedToken, refresh)
          realtimeService.connect(savedToken)
        })
        .catch(() => {
          localStorage.removeItem('pisteup_token')
          localStorage.removeItem('pisteup_refresh')
        })
    } else if (savedToken) {
      realtimeService.connect(savedToken)
    }
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"       element={<LoginPage />} />
        <Route path="/register"    element={<RegisterPage />} />
        <Route path="/map"         element={<ProtectedRoute><Layout><MapPage /></Layout></ProtectedRoute>} />
        <Route path="/feed"        element={<ProtectedRoute><Layout><FeedPage /></Layout></ProtectedRoute>} />
        <Route path="/u/:username" element={<ProtectedRoute><Layout><ProfilePage /></Layout></ProtectedRoute>} />
        <Route path="*"            element={<Navigate to="/map" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
