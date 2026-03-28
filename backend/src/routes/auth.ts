import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { query, queryOne } from '../config/db'
import { requireAuth, type AuthRequest, JWT_SECRET, JWT_REFRESH } from '../middleware/auth'
import { authLimiter } from '../middleware/rateLimiter'

const router = Router()
const signAccess  = (id: string) => jwt.sign({ sub: id }, JWT_SECRET,  { expiresIn: '15m' })
const signRefresh = (id: string) => jwt.sign({ sub: id }, JWT_REFRESH, { expiresIn: '30d' })
const SAFE = `id,username,display_name,avatar_url,bio,vehicle,home_country,km_logged,countries_visited,trust_score,created_at`

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  const p = z.object({
    username:    z.string().min(3).max(40).regex(/^[a-z0-9_.]+$/i),
    email:       z.string().email(),
    password:    z.string().min(8).max(72),
    displayName: z.string().min(1).max(80),
    vehicle:     z.string().max(80).optional(),
  }).safeParse(req.body)
  if (!p.success) { res.status(400).json({ message: 'Validation error', errors: p.error.errors }); return }

  const exists = await queryOne(`SELECT id FROM users WHERE email=$1 OR username=$2`, [p.data.email, p.data.username])
  if (exists) { res.status(409).json({ message: 'Email or username already taken' }); return }

  const hash = await bcrypt.hash(p.data.password, 12)
  const user = await queryOne(
    `INSERT INTO users(username,email,password_hash,display_name,vehicle) VALUES($1,$2,$3,$4,$5) RETURNING ${SAFE}`,
    [p.data.username, p.data.email, hash, p.data.displayName, p.data.vehicle ?? null]
  )
  const token = signAccess(user!.id as string)
  const refreshToken = signRefresh(user!.id as string)
  await query(`INSERT INTO refresh_tokens(user_id,token,expires_at) VALUES($1,$2,$3)`,
    [user!.id, refreshToken, new Date(Date.now() + 30*24*60*60*1000)])
  res.status(201).json({ user, token, refreshToken })
})

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const p = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body)
  if (!p.success) { res.status(400).json({ message: 'Validation error' }); return }

  const row = await queryOne<Record<string,unknown>>(
    `SELECT ${SAFE},password_hash FROM users WHERE email=$1`, [p.data.email]
  )
  if (!row || !(await bcrypt.compare(p.data.password, row.password_hash as string))) {
    res.status(401).json({ message: 'Invalid credentials' }); return
  }
  const { password_hash, ...user } = row
  const token = signAccess(user.id as string)
  const refreshToken = signRefresh(user.id as string)
  await query(`INSERT INTO refresh_tokens(user_id,token,expires_at) VALUES($1,$2,$3)`,
    [user.id, refreshToken, new Date(Date.now() + 30*24*60*60*1000)])
  res.json({ user, token, refreshToken })
})

router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body
  if (!refreshToken) { res.status(400).json({ message: 'Missing token' }); return }
  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH) as { sub: string }
    const stored = await queryOne(`SELECT expires_at FROM refresh_tokens WHERE token=$1`, [refreshToken])
    if (!stored || new Date(stored.expires_at as string) < new Date()) {
      res.status(401).json({ message: 'Token expired' }); return
    }
    res.json({ token: signAccess(payload.sub) })
  } catch { res.status(401).json({ message: 'Invalid token' }) }
})

router.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  if (req.body.refreshToken) await query(`DELETE FROM refresh_tokens WHERE token=$1`, [req.body.refreshToken])
  res.json({ ok: true })
})

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const user = await queryOne(
    `SELECT ${SAFE},
       (SELECT COUNT(*) FROM reports WHERE author_id=u.id)::int AS report_count,
       (SELECT COUNT(*) FROM follows  WHERE following_id=u.id)::int AS followers_count,
       (SELECT COUNT(*) FROM follows  WHERE follower_id=u.id)::int  AS following_count
     FROM users u WHERE u.id=$1`, [req.userId])
  if (!user) { res.status(404).json({ message: 'Not found' }); return }
  res.json(user)
})

export default router
