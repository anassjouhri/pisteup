import { Server, type Socket } from 'socket.io'
import http from 'node:http'
import jwt from 'jsonwebtoken'
import { pool } from '../config/db'
import { cache } from '../config/cache'
import { JWT_SECRET } from '../middleware/auth'

let io: Server

export function initSocket(server: http.Server) {
  io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true },
    transports: ['websocket', 'polling'],
  })

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (!token) return next(new Error('Auth required'))
    try {
      const p = jwt.verify(token, JWT_SECRET) as { sub: string }
      ;(socket as S).userId = p.sub
      next()
    } catch { next(new Error('Invalid token')) }
  })

  io.on('connection', (socket: Socket) => {
    const s = socket as S
    cache.set(`online:${s.userId}`, '1', 600)

    s.on('map:subscribe', (b) => { const r = room(b); s.join(r); s.room = r })
    s.on('map:unsubscribe', () => { if (s.room) s.leave(s.room) })

    s.on('location:update', async ({ lat, lng, heading }) => {
      cache.set(`loc:${s.userId}`, JSON.stringify({ lat, lng, heading }), 600)
      await pool.query(`UPDATE users SET location_lat=$1,location_lng=$2,last_seen_at=now() WHERE id=$3`, [lat, lng, s.userId])
      const meta = await getMeta(s.userId)
      if (!meta) return
      const payload = { userId: s.userId, ...meta, location: { lat, lng }, heading, updatedAt: new Date().toISOString() }
      rooms(lat, lng).forEach(r => io.to(r).emit('traveller:move', payload))
      io.emit('traveller:online', payload)
    })

    s.on('disconnect', () => {
      cache.del(`online:${s.userId}`)
      io.emit('traveller:offline', { userId: s.userId })
    })
  })

  return io
}

export function broadcast(event: string, data: unknown) {
  if (!io) return
  const r = data as { lat?: number; lng?: number }
  if (r.lat != null && r.lng != null) {
    rooms(r.lat, r.lng).forEach(room => io.to(room).emit(event, data))
  } else {
    io.emit(event, data)
  }
}

interface S extends Socket { userId: string; room?: string }

const room = (b: { swLat: number; swLng: number; neLat: number; neLng: number }) =>
  `m:${Math.round((b.swLat + b.neLat) / 4) * 2}:${Math.round((b.swLng + b.neLng) / 4) * 2}`

const rooms = (lat: number, lng: number): string[] =>
  [...new Set([-2,0,2].flatMap(a => [-2,0,2].map(b =>
    `m:${Math.round((lat + a) / 2) * 2}:${Math.round((lng + b) / 2) * 2}`
  )))]

const metaCache = new Map<string, object>()
async function getMeta(id: string) {
  if (metaCache.has(id)) return metaCache.get(id)
  const { rows } = await pool.query(`SELECT username,avatar_url,vehicle FROM users WHERE id=$1`, [id])
  if (rows[0]) metaCache.set(id, { username: rows[0].username, avatarUrl: rows[0].avatar_url, vehicle: rows[0].vehicle })
  return metaCache.get(id) ?? null
}
