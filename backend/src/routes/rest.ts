import { Router, type Response } from 'express'
import { z } from 'zod'
import { query, queryOne } from '../config/db'
import { requireAuth, optionalAuth, type AuthRequest } from '../middleware/auth'
import { reverseGeocode, searchPlaces } from '../services/geo'

// Author aliases — camelCase via json_build_object
const AUTHOR = `json_build_object('id',u.id,'username',u.username,'displayName',u.display_name,'avatarUrl',u.avatar_url,'trustScore',u.trust_score) AS author`

// ── Feed ──────────────────────────────────────

export const feedRouter = Router()

const POST_COLS = `p.id,p.content,p.photos,p.lat,p.lng,p.location_name,p.country_code,p.tags,p.upvotes,p.created_at,(SELECT COUNT(*) FROM comments WHERE post_id=p.id)::int AS comment_count,${AUTHOR}`

feedRouter.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  const { page = '1', countryCode } = req.query as Record<string,string>
  const offset = (Math.max(1, parseInt(page)) - 1) * 20
  const params: unknown[] = []
  const where = countryCode ? (params.push(countryCode), `WHERE p.country_code=$1`) : ''
  const rows = await query(
    `SELECT ${POST_COLS} FROM posts p JOIN users u ON u.id=p.author_id ${where} ORDER BY p.created_at DESC LIMIT 20 OFFSET ${offset}`,
    params
  )
  res.json({ data: rows, page: parseInt(page), hasMore: rows.length === 20 })
})

feedRouter.get('/:id', async (req, res: Response) => {
  const p = await queryOne(`SELECT ${POST_COLS} FROM posts p JOIN users u ON u.id=p.author_id WHERE p.id=$1`, [req.params.id])
  if (!p) { res.status(404).json({ message: 'Not found' }); return }
  res.json(p)
})

feedRouter.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const p = z.object({
    content:      z.string().min(5).max(5000),
    lat:          z.number().optional(),
    lng:          z.number().optional(),
    locationName: z.string().max(120).optional(),
    countryCode:  z.string().max(2).optional(),
    tags:         z.array(z.string()).max(10).default([]),
  }).safeParse(req.body)
  if (!p.success) { res.status(400).json({ message: 'Validation error', errors: p.error.errors }); return }
  const { content, lat, lng, locationName, countryCode, tags } = p.data
  const post = await queryOne(
    `INSERT INTO posts(author_id,content,lat,lng,location_name,country_code,tags) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.userId, content, lat, lng, locationName, countryCode, tags]
  )
  res.status(201).json(post)
})

feedRouter.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const post = await queryOne(`SELECT author_id FROM posts WHERE id=$1`, [req.params.id])
  if (!post) { res.status(404).json({ message: 'Not found' }); return }
  if (post.author_id !== req.userId) { res.status(403).json({ message: 'Forbidden' }); return }
  await query(`DELETE FROM posts WHERE id=$1`, [req.params.id])
  res.json({ ok: true })
})

feedRouter.post('/:id/vote', requireAuth, async (req: AuthRequest, res: Response) => {
  const { value } = req.body
  if (![1,-1,0].includes(value)) { res.status(400).json({ message: 'Invalid value' }); return }
  const pid = req.params.id, uid = req.userId!
  if (value === 0) await query(`DELETE FROM votes WHERE user_id=$1 AND post_id=$2`, [uid, pid])
  else await query(`INSERT INTO votes(user_id,post_id,value) VALUES($1,$2,$3) ON CONFLICT(user_id,post_id) DO UPDATE SET value=$3`, [uid, pid, value])
  const ups = await queryOne<{count:string}>(`SELECT COUNT(*) FROM votes WHERE post_id=$1 AND value=1`, [pid])
  const upvotes = parseInt(ups?.count ?? '0')
  await query(`UPDATE posts SET upvotes=$1 WHERE id=$2`, [upvotes, pid])
  res.json({ upvotes })
})

feedRouter.get('/:id/comments', async (req, res: Response) => {
  const rows = await query(
    `SELECT c.id,c.content,c.upvotes,c.created_at,json_build_object('id',u.id,'username',u.username,'displayName',u.display_name,'avatarUrl',u.avatar_url) AS author FROM comments c JOIN users u ON u.id=c.author_id WHERE c.post_id=$1 ORDER BY c.created_at ASC`,
    [req.params.id]
  )
  res.json(rows)
})

feedRouter.post('/:id/comments', requireAuth, async (req: AuthRequest, res: Response) => {
  const { content } = req.body
  if (!content?.trim()) { res.status(400).json({ message: 'Content required' }); return }
  const c = await queryOne(
    `INSERT INTO comments(post_id,author_id,content) VALUES($1,$2,$3) RETURNING *`,
    [req.params.id, req.userId, content.trim()]
  )
  res.status(201).json(c)
})

feedRouter.delete('/:postId/comments/:commentId', requireAuth, async (req: AuthRequest, res: Response) => {
  const c = await queryOne(`SELECT author_id FROM comments WHERE id=$1`, [req.params.commentId])
  if (!c) { res.status(404).json({ message: 'Not found' }); return }
  if (c.author_id !== req.userId) { res.status(403).json({ message: 'Forbidden' }); return }
  await query(`DELETE FROM comments WHERE id=$1`, [req.params.commentId])
  res.json({ ok: true })
})

// ── Users ─────────────────────────────────────

export const usersRouter = Router()
const UCOLS = `id,username,display_name,avatar_url,bio,vehicle,home_country,km_logged,countries_visited,trust_score,created_at`

usersRouter.get('/nearby', optionalAuth, async (req, res: Response) => {
  const { lat, lng, radiusKm = '500' } = req.query as Record<string,string>
  if (!lat || !lng) { res.status(400).json({ message: 'lat and lng required' }); return }
  const rows = await query(
    `SELECT ${UCOLS} FROM users WHERE location IS NOT NULL AND ST_DWithin(location,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,$3) LIMIT 50`,
    [parseFloat(lng), parseFloat(lat), parseFloat(radiusKm) * 1000]
  )
  res.json(rows)
})

usersRouter.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const u = await queryOne(
    `SELECT ${UCOLS},(SELECT COUNT(*) FROM reports WHERE author_id=u.id)::int AS report_count FROM users u WHERE u.id=$1`,
    [req.userId]
  )
  if (!u) { res.status(404).json({ message: 'Not found' }); return }
  res.json(u)
})

usersRouter.patch('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  const p = z.object({
    displayName: z.string().min(1).max(80).optional(),
    bio:         z.string().max(500).optional(),
    vehicle:     z.string().max(80).optional(),
    homeCountry: z.string().max(2).optional(),
  }).safeParse(req.body)
  if (!p.success) { res.status(400).json({ message: 'Validation error', errors: p.error.errors }); return }
  const u = await queryOne(
    `UPDATE users SET display_name=COALESCE($1,display_name),bio=COALESCE($2,bio),vehicle=COALESCE($3,vehicle),home_country=COALESCE($4,home_country) WHERE id=$5 RETURNING ${UCOLS}`,
    [p.data.displayName, p.data.bio, p.data.vehicle, p.data.homeCountry, req.userId]
  )
  res.json(u)
})

usersRouter.get('/:username', optionalAuth, async (req: AuthRequest, res: Response) => {
  const u = await queryOne(
    `SELECT ${UCOLS},
       (SELECT COUNT(*) FROM reports WHERE author_id=u.id)::int AS report_count,
       (SELECT COUNT(*) FROM follows  WHERE following_id=u.id)::int AS followers_count,
       (SELECT COUNT(*) FROM follows  WHERE follower_id=u.id)::int  AS following_count
     FROM users u WHERE u.username=$1`,
    [req.params.username]
  )
  if (!u) { res.status(404).json({ message: 'Not found' }); return }
  let isFollowing = false
  if (req.userId && req.userId !== u.id) {
    const f = await queryOne(`SELECT 1 FROM follows WHERE follower_id=$1 AND following_id=$2`, [req.userId, u.id])
    isFollowing = !!f
  }
  res.json({ ...u, isFollowing })
})

usersRouter.post('/:userId/follow', requireAuth, async (req: AuthRequest, res: Response) => {
  if (req.params.userId === req.userId) { res.status(400).json({ message: 'Cannot follow yourself' }); return }
  await query(`INSERT INTO follows(follower_id,following_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [req.userId, req.params.userId])
  res.json({ ok: true })
})

usersRouter.delete('/:userId/follow', requireAuth, async (req: AuthRequest, res: Response) => {
  await query(`DELETE FROM follows WHERE follower_id=$1 AND following_id=$2`, [req.userId, req.params.userId])
  res.json({ ok: true })
})

usersRouter.get('/:username/trips', async (req, res: Response) => {
  const u = await queryOne(`SELECT id FROM users WHERE username=$1`, [req.params.username])
  if (!u) { res.status(404).json({ message: 'Not found' }); return }
  const trips = await query(`SELECT * FROM trips WHERE user_id=$1 ORDER BY start_date DESC`, [u.id])
  res.json(trips)
})

// ── Trips ─────────────────────────────────────

export const tripsRouter = Router()

tripsRouter.get('/:id', async (req, res: Response) => {
  const t = await queryOne(`SELECT t.*,u.username,u.display_name FROM trips t JOIN users u ON u.id=t.user_id WHERE t.id=$1`, [req.params.id])
  if (!t) { res.status(404).json({ message: 'Not found' }); return }
  const waypoints = await query(`SELECT * FROM trip_waypoints WHERE trip_id=$1 ORDER BY arrived_at ASC`, [req.params.id])
  res.json({ ...t, waypoints })
})

tripsRouter.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const p = z.object({
    title:       z.string().min(3).max(120),
    description: z.string().max(2000).optional(),
    startDate:   z.string().datetime(),
    endDate:     z.string().datetime().optional(),
    isActive:    z.boolean().default(false),
  }).safeParse(req.body)
  if (!p.success) { res.status(400).json({ message: 'Validation error', errors: p.error.errors }); return }
  if (p.data.isActive) await query(`UPDATE trips SET is_active=false WHERE user_id=$1`, [req.userId])
  const t = await queryOne(
    `INSERT INTO trips(user_id,title,description,start_date,end_date,is_active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.userId, p.data.title, p.data.description, p.data.startDate, p.data.endDate, p.data.isActive]
  )
  res.status(201).json(t)
})

tripsRouter.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const t = await queryOne(`SELECT user_id FROM trips WHERE id=$1`, [req.params.id])
  if (!t) { res.status(404).json({ message: 'Not found' }); return }
  if (t.user_id !== req.userId) { res.status(403).json({ message: 'Forbidden' }); return }
  const updated = await queryOne(
    `UPDATE trips SET title=COALESCE($1,title),description=COALESCE($2,description),end_date=COALESCE($3,end_date),is_active=COALESCE($4,is_active) WHERE id=$5 RETURNING *`,
    [req.body.title, req.body.description, req.body.endDate, req.body.isActive, req.params.id]
  )
  res.json(updated)
})

tripsRouter.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const t = await queryOne(`SELECT user_id FROM trips WHERE id=$1`, [req.params.id])
  if (!t) { res.status(404).json({ message: 'Not found' }); return }
  if (t.user_id !== req.userId) { res.status(403).json({ message: 'Forbidden' }); return }
  await query(`DELETE FROM trips WHERE id=$1`, [req.params.id])
  res.json({ ok: true })
})

tripsRouter.post('/:id/waypoints', requireAuth, async (req: AuthRequest, res: Response) => {
  const t = await queryOne(`SELECT user_id FROM trips WHERE id=$1`, [req.params.id])
  if (!t) { res.status(404).json({ message: 'Not found' }); return }
  if (t.user_id !== req.userId) { res.status(403).json({ message: 'Forbidden' }); return }
  const p = z.object({
    lat:          z.number(),
    lng:          z.number(),
    locationName: z.string().max(120).optional(),
    arrivedAt:    z.string().datetime().optional(),
    note:         z.string().max(1000).optional(),
  }).safeParse(req.body)
  if (!p.success) { res.status(400).json({ message: 'Validation error', errors: p.error.errors }); return }
  const wp = await queryOne(
    `INSERT INTO trip_waypoints(trip_id,lat,lng,location_name,arrived_at,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, p.data.lat, p.data.lng, p.data.locationName, p.data.arrivedAt ?? new Date().toISOString(), p.data.note]
  )
  res.status(201).json(wp)
})

// ── Geo ───────────────────────────────────────

export const geoRouter = Router()

geoRouter.get('/search', async (req, res: Response) => {
  const { q, lat, lng } = req.query as Record<string,string>
  if (!q?.trim()) { res.status(400).json({ message: 'Query required' }); return }
  const results = await searchPlaces(q.trim(), lat ? parseFloat(lat) : undefined, lng ? parseFloat(lng) : undefined)
  res.json(results)
})

geoRouter.get('/reverse', async (req, res: Response) => {
  const { lat, lng } = req.query as Record<string,string>
  if (!lat || !lng) { res.status(400).json({ message: 'lat and lng required' }); return }
  const result = await reverseGeocode(parseFloat(lat), parseFloat(lng))
  result ? res.json(result) : res.status(404).json({ message: 'Not found' })
})
