// ── Avatar ────────────────────────────────────

import { createPortal } from 'react-dom'
import { useEffect, type ReactNode, type ButtonHTMLAttributes } from 'react'
import type { User, AuthorRef, ReportStatus, ReportType } from '@/types'

type AvatarUser = Pick<User, 'display_name' | 'avatar_url'> | Pick<AuthorRef, 'displayName' | 'avatarUrl'>

function getDisplayName(u: AvatarUser) {
  return 'display_name' in u ? u.display_name : u.displayName
}
function getAvatarUrl(u: AvatarUser) {
  return 'avatar_url' in u ? u.avatar_url : u.avatarUrl
}

const SIZES = { sm: 28, md: 38, lg: 56 }
const FONTS = { sm: 11, md: 14, lg: 20 }

export function Avatar({ user, size = 'md' }: { user: AvatarUser; size?: 'sm' | 'md' | 'lg' }) {
  const px = SIZES[size], name = getDisplayName(user), url = getAvatarUrl(user)
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (url) return <img src={url} alt={name} style={{ width: px, height: px, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return <div style={{ width: px, height: px, borderRadius: '50%', flexShrink: 0, background: 'rgba(232,98,42,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: FONTS[size], fontWeight: 700, color: '#E8622A' }}>{initials}</div>
}

// ── Badge ─────────────────────────────────────

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  good:     { bg: 'rgba(90,122,58,0.25)',   color: '#7AB050' },
  warning:  { bg: 'rgba(200,169,110,0.2)',  color: '#C8A96E' },
  bad:      { bg: 'rgba(232,98,42,0.2)',    color: '#E8622A' },
  closed:   { bg: 'rgba(204,51,51,0.2)',    color: '#CC5555' },
  unknown:  { bg: 'rgba(139,111,71,0.2)',   color: '#8B6F47' },
  road:     { bg: 'rgba(91,143,168,0.15)',  color: '#5B8FA8' },
  border:   { bg: 'rgba(232,98,42,0.15)',   color: '#E8622A' },
  camp:     { bg: 'rgba(90,122,58,0.15)',   color: '#7AB050' },
  fuel:     { bg: 'rgba(200,169,110,0.15)', color: '#C8A96E' },
  mechanic: { bg: 'rgba(139,111,71,0.15)',  color: '#8B6F47' },
  hazard:   { bg: 'rgba(204,51,51,0.15)',   color: '#CC5555' },
}

export function Badge({ variant, label }: { variant: ReportStatus | ReportType | string; label: string }) {
  const s = BADGE_STYLES[variant] ?? { bg: 'rgba(139,111,71,0.2)', color: '#8B6F47' }
  return <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', padding: '2px 7px', borderRadius: 3, textTransform: 'uppercase', background: s.bg, color: s.color, flexShrink: 0 }}>{label}</span>
}

// ── Spinner ───────────────────────────────────

export function Spinner({ size = 20 }: { size?: number }) {
  return <>
    <style>{`@keyframes _spin{to{transform:rotate(360deg)}}`}</style>
    <div style={{ width: size, height: size, borderRadius: '50%', border: '2px solid rgba(232,98,42,0.2)', borderTopColor: '#E8622A', animation: '_spin 0.7s linear infinite' }} />
  </>
}

// ── Button ────────────────────────────────────

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  loading?: boolean
}

const BTN = {
  primary: { background: '#E8622A', color: '#fff', border: 'none' },
  ghost:   { background: 'transparent', color: '#C8A96E', border: '1px solid rgba(200,169,110,0.3)' },
  danger:  { background: 'transparent', color: '#CC5555', border: '1px solid rgba(204,51,51,0.3)' },
}

export function Button({ variant = 'ghost', loading, children, disabled, style, ...rest }: ButtonProps) {
  return (
    <button disabled={disabled || loading} style={{ ...BTN[variant], padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 8, opacity: disabled ? 0.5 : 1, cursor: disabled || loading ? 'not-allowed' : 'pointer', ...style }} {...rest}>
      {loading && <Spinner size={14} />}{children}
    </button>
  )
}

// ── Modal ─────────────────────────────────────

export function Modal({ open, onClose, title, children, width = 480 }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#261C14', border: '1px solid rgba(200,169,110,0.2)', borderRadius: 10, width: '100%', maxWidth: width, maxHeight: '90vh', overflow: 'auto' }}>
        {title && <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(200,169,110,0.12)', fontSize: 15, fontWeight: 600, color: '#D4C9B5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>{title}<button onClick={onClose} style={{ color: '#6A5A48', fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}>×</button></div>}
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>,
    document.body
  )
}
