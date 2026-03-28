import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { query, queryOne, pool, transaction } from '../config/db'
import { requireAuth, optionalAuth, type AuthRequest } from '../middleware/auth'
import { parseGpx } from '../services/gpx'

const router = Router()

const AUTHOR = `json_build_object('id',u.id,'username',u.username,'displayName',u.display_name,'avatarUrl',u.avatar_url) AS author`
const COLS   = `t.id,t.title,t.description,t.distance_km,t.elevation_gain_m,t.point_count,t.surface_type,t.difficulty,t.bbox_sw_lat,t.bbox_sw_lng,t.bbox_ne_lat,t.bbox_ne_lng,t.trip_id,t.is_public,t.created_at,t.updated_at,${AUTHOR}`

// ── List tracks in viewport ───────────────────

router.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  const { swLat, swLng, neLat, neLng, authorId, page = '1', pageSize = '30' } = req.query as Record<string,string>

  const pageNum = Math.max(1, parseInt(page))
  const pageSz  = Math.min(50, parseInt(pageSize))
  const offset  = (pageNum - 1) * pageSz
  const params: unknown[] = []
  let spatial = ''
  let authorFilter = ''

  if (swLat && swLng && neLat && neLng) {
    params.push(parseFloat(swLng), parseFloat(swLat), parseFloat(neLng), parseFloat(neLat))
    spatial = `AND ST_Intersects(t.route::geometry, ST_MakeEnvelope($1,$2,$3,$4,4326))`
  }

  if (authorId) {
    params.push(authorId)
    authorFilter = `AND t.author_id=$${params.length}`
  }

  const rows = await query(
    `SELECT ${COLS} FROM tracks t JOIN users u ON u.id=t.author_id
     WHERE t.is_public=true ${spatial} ${authorFilter}
     ORDER BY t.created_at DESC LIMIT ${pageSz} OFFSET ${offset}`,
    params
  )
  res.json({ data: rows, page: pageNum, hasMore: rows.length === pageSz })
})

// ── Get single track with GeoJSON route ───────

router.get('/:id', optionalAuth, async (req, res: Response) => {
  const track = await queryOne(
    `SELECT ${COLS},
       ST_AsGeoJSON(t.route::geometry)::json AS geojson
     FROM tracks t JOIN users u ON u.id=t.author_id
     WHERE t.id=$1`,
    [req.params.id]
  )
  if (!track) { res.status(404).json({ message: 'Not found' }); return }
  res.json(track)
})

// ── Upload GPX ────────────────────────────────

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const p = z.object({
    gpxContent:  z.string().min(10),            // raw GPX XML string
    title:       z.string().min(3).max(120).optional(),
    description: z.string().max(2000).optional(),
    surfaceType: z.enum(['paved','unpaved','mixed','offroad','sand','gravel','mud']).optional(),
    difficulty:  z.enum(['easy','moderate','hard','extreme']).optional(),
    tripId:      z.string().uuid().optional(),
    isPublic:    z.boolean().default(true),
  }).safeParse(req.body)

  if (!p.success) { res.status(400).json({ message: 'Validation error', errors: p.error.errors }); return }

  let parsed
  try {
    parsed = parseGpx(p.data.gpxContent)
  } catch (err: unknown) {
    res.status(422).json({ message: err instanceof Error ? err.message : 'Invalid GPX file' }); return
  }

  const title       = p.data.title       ?? parsed.name
  const description = p.data.description ?? parsed.description

  // Build WKT LineString for PostGIS
  const coords = parsed.points.map(pt => `${pt.lng} ${pt.lat}`).join(',')
  const wkt    = `LINESTRING(${coords})`

  const trackId = await transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO tracks(
         author_id,trip_id,title,description,
         distance_km,elevation_gain_m,point_count,
         surface_type,difficulty,is_public,
         route,bbox_sw_lat,bbox_sw_lng,bbox_ne_lat,bbox_ne_lng
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
         ST_GeogFromText($11),$12,$13,$14,$15
       ) RETURNING id`,
      [
        req.userId, p.data.tripId ?? null,
        title, description,
        parsed.distanceKm, parsed.elevationGainM, parsed.points.length,
        p.data.surfaceType ?? null, p.data.difficulty ?? null, p.data.isPublic,
        wkt,
        parsed.bbox.swLat, parsed.bbox.swLng,
        parsed.bbox.neLat, parsed.bbox.neLng,
      ]
    )
    const id = rows[0].id

    // Insert track points in batches of 500
    const batchSize = 500
    for (let i = 0; i < parsed.points.length; i += batchSize) {
      const batch  = parsed.points.slice(i, i + batchSize)
      const values = batch.map((pt, j) => `($${j*5+1},$${j*5+2},$${j*5+3},$${j*5+4},$${j*5+5})`).join(',')
      const flat   = batch.flatMap(pt => [id, pt.lat, pt.lng, pt.elevation, pt.seq])
      await client.query(
        `INSERT INTO track_points(track_id,lat,lng,elevation,seq) VALUES ${values}`,
        flat
      )
    }
    return id
  })

  const track = await queryOne(
    `SELECT ${COLS} FROM tracks t JOIN users u ON u.id=t.author_id WHERE t.id=$1`,
    [trackId]
  )
  res.status(201).json(track)
})

// ── Update metadata ───────────────────────────

router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const t = await queryOne(`SELECT author_id FROM tracks WHERE id=$1`, [req.params.id])
  if (!t) { res.status(404).json({ message: 'Not found' }); return }
  if (t.author_id !== req.userId) { res.status(403).json({ message: 'Forbidden' }); return }
  const updated = await queryOne(
    `UPDATE tracks SET
       title=COALESCE($1,title), description=COALESCE($2,description),
       surface_type=COALESCE($3,surface_type), difficulty=COALESCE($4,difficulty),
       is_public=COALESCE($5,is_public), updated_at=now()
     WHERE id=$6 RETURNING *`,
    [req.body.title, req.body.description, req.body.surfaceType, req.body.difficulty, req.body.isPublic, req.params.id]
  )
  res.json(updated)
})

// ── Delete ────────────────────────────────────

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const t = await queryOne(`SELECT author_id FROM tracks WHERE id=$1`, [req.params.id])
  if (!t) { res.status(404).json({ message: 'Not found' }); return }
  if (t.author_id !== req.userId) { res.status(403).json({ message: 'Forbidden' }); return }
  await query(`DELETE FROM tracks WHERE id=$1`, [req.params.id])
  res.json({ ok: true })
})

// ── Get track points (for elevation profile) ──

router.get('/:id/points', async (req, res: Response) => {
  const points = await query(
    `SELECT lat,lng,elevation,seq FROM track_points WHERE track_id=$1 ORDER BY seq ASC`,
    [req.params.id]
  )
  res.json(points)
})

export default router