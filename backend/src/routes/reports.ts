import { Router, type Response } from 'express'
import { z } from 'zod'
import { query, queryOne, transaction } from '../config/db'
import { requireAuth, optionalAuth, type AuthRequest } from '../middleware/auth'
import { reportLimiter } from '../middleware/rateLimiter'
import { reverseGeocode } from '../services/geo'
import { broadcast } from '../services/socket'

const router = Router()

// Author built with json_build_object so uses camelCase aliases
const COLS = `
  r.id, r.type, r.status, r.title, r.description,
  r.lat, r.lng, r.location_name, r.country_code,
  r.upvotes, r.downvotes, r.tags, r.vehicle_types,
  r.photos, r.expires_at, r.created_at, r.updated_at,
  json_build_object(
    'id',          u.id,
    'username',    u.username,
    'displayName', u.display_name,
    'avatarUrl',   u.avatar_url,
    'trustScore',  u.trust_score
  ) AS author`

const CreateSchema = z.object({
  type:         z.enum(['road','border','camp','fuel','mechanic','hazard']),
  status:       z.enum(['good','warning','bad','closed','unknown']).default('unknown'),
  title:        z.string().min(5).max(120),
  description:  z.string().min(10).max(2000),
  lat:          z.number().min(-90).max(90),
  lng:          z.number().min(-180).max(180),
  tags:         z.array(z.string()).max(8).default([]),
  vehicleTypes: z.array(z.string()).default([]),
  roadCondition: z.object({
    surfaceScore: z.number(), safetyScore: z.number(),
    surfaceType: z.string(), passableBy: z.array(z.string()),
    distanceKm: z.number().optional(),
  }).optional(),
  borderData: z.object({
    waitTimeMinutes: z.number().optional(), cost: z.number().optional(),
    currency: z.string().optional(), documentsRequired: z.array(z.string()).default([]),
    visaOnArrival: z.boolean().optional(), carnetRequired: z.boolean().optional(),
    notes: z.string().optional(),
  }).optional(),
  campData: z.object({
    isFree: z.boolean().default(true), pricePerNight: z.number().optional(),
    currency: z.string().optional(), hasWater: z.boolean().default(false),
    hasFacilities: z.boolean().default(false), isWild: z.boolean().default(true),
  }).optional(),
  fuelData: z.object({
    diesel: z.number().optional(), petrol: z.number().optional(),
    currency: z.string().optional(), available: z.boolean().default(true),
    queueMinutes: z.number().optional(),
  }).optional(),
})

router.get('/', optionalAuth, async (req: AuthRequest, res: Response) => {
  const {
    lat, lng, radiusKm = '200',
    swLat, swLng, neLat, neLng,
    types, statuses, maxAgeHours = '168',
    page = '1', pageSize = '50',
  } = req.query as Record<string, string>

  const pageNum = Math.max(1, parseInt(page))
  const pageSz  = Math.min(100, parseInt(pageSize))
  const offset  = (pageNum - 1) * pageSz
  const maxAge  = new Date(Date.now() - parseInt(maxAgeHours) * 3600_000)
  const params: unknown[] = [maxAge]
  let spatial = ''

  if (lat && lng) {
    params.push(parseFloat(lng), parseFloat(lat), parseFloat(radiusKm) * 1000)
    spatial = `AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, $4)`
  } else if (swLat && swLng && neLat && neLng) {
    params.push(parseFloat(swLng), parseFloat(swLat), parseFloat(neLng), parseFloat(neLat))
    spatial = `AND ST_Within(r.location::geometry, ST_MakeEnvelope($2,$3,$4,$5,4326))`
  }

  const tf = types   ? `AND r.type=ANY($${params.length+1}::report_type[])` : ''
  const sf = statuses ? `AND r.status=ANY($${params.length+(types?1:0)+1}::report_status[])` : ''
  if (types)    params.push(types.split(','))
  if (statuses) params.push(statuses.split(','))

  const rows = await query(
    `SELECT ${COLS} FROM reports r
     JOIN users u ON u.id = r.author_id
     WHERE r.created_at >= $1
       AND (r.expires_at IS NULL OR r.expires_at > now())
       ${spatial} ${tf} ${sf}
     ORDER BY r.created_at DESC
     LIMIT ${pageSz} OFFSET ${offset}`,
    params
  )
  res.json({ data: rows, page: pageNum, pageSize: pageSz, hasMore: rows.length === pageSz })
})

router.get('/:id', optionalAuth, async (req, res: Response) => {
  const r = await queryOne(
    `SELECT ${COLS} FROM reports r JOIN users u ON u.id=r.author_id WHERE r.id=$1`,
    [req.params.id]
  )
  if (!r) { res.status(404).json({ message: 'Not found' }); return }
  res.json(r)
})

router.post('/', requireAuth, reportLimiter, async (req: AuthRequest, res: Response) => {
  const p = CreateSchema.safeParse(req.body)
  if (!p.success) { res.status(400).json({ message: 'Validation error', errors: p.error.errors }); return }

  const { roadCondition, borderData, campData, fuelData, tags, vehicleTypes, ...core } = p.data
  const geo = await reverseGeocode(core.lat, core.lng)

  // Insert and collect just the id inside the transaction
  const reportId = await transaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO reports(type,status,title,description,lat,lng,location_name,country_code,author_id,tags,vehicle_types)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [core.type, core.status, core.title, core.description, core.lat, core.lng,
       geo?.name, geo?.countryCode, req.userId, tags, vehicleTypes]
    )
    const id = rows[0].id
    if (roadCondition) await client.query(
      `INSERT INTO road_conditions(report_id,surface_score,safety_score,surface_type,passable_by,distance_km) VALUES($1,$2,$3,$4,$5,$6)`,
      [id, roadCondition.surfaceScore, roadCondition.safetyScore, roadCondition.surfaceType, roadCondition.passableBy, roadCondition.distanceKm]
    )
    if (borderData) await client.query(
      `INSERT INTO border_data(report_id,wait_time_minutes,cost,currency,documents_required,visa_on_arrival,carnet_required,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, borderData.waitTimeMinutes, borderData.cost, borderData.currency, borderData.documentsRequired, borderData.visaOnArrival, borderData.carnetRequired, borderData.notes]
    )
    if (campData) await client.query(
      `INSERT INTO camp_data(report_id,is_free,price_per_night,currency,has_water,has_facilities,is_wild) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [id, campData.isFree, campData.pricePerNight, campData.currency, campData.hasWater, campData.hasFacilities, campData.isWild]
    )
    if (fuelData) await client.query(
      `INSERT INTO fuel_data(report_id,diesel,petrol,currency,available,queue_minutes) VALUES($1,$2,$3,$4,$5,$6)`,
      [id, fuelData.diesel, fuelData.petrol, fuelData.currency, fuelData.available, fuelData.queueMinutes]
    )
    return id
  })

  // Fetch the full report with author joined — same shape as all GET responses
  const report = await queryOne(
    `SELECT ${COLS} FROM reports r JOIN users u ON u.id=r.author_id WHERE r.id=$1`,
    [reportId]
  )

  broadcast('report:new', report)
  res.status(201).json(report)
})

router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const r = await queryOne(`SELECT author_id FROM reports WHERE id=$1`, [req.params.id])
  if (!r) { res.status(404).json({ message: 'Not found' }); return }
  if (r.author_id !== req.userId) { res.status(403).json({ message: 'Forbidden' }); return }
  await query(
    `UPDATE reports SET title=COALESCE($1,title),description=COALESCE($2,description),status=COALESCE($3,status) WHERE id=$4`,
    [req.body.title, req.body.description, req.body.status, req.params.id]
  )
  const full = await queryOne(
    `SELECT ${COLS} FROM reports r JOIN users u ON u.id=r.author_id WHERE r.id=$1`,
    [req.params.id]
  )
  broadcast('report:updated', full!)
  res.json(full)
})

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const r = await queryOne(`SELECT author_id FROM reports WHERE id=$1`, [req.params.id])
  if (!r) { res.status(404).json({ message: 'Not found' }); return }
  if (r.author_id !== req.userId) { res.status(403).json({ message: 'Forbidden' }); return }
  await query(`DELETE FROM reports WHERE id=$1`, [req.params.id])
  res.json({ ok: true })
})

router.post('/:id/vote', requireAuth, async (req: AuthRequest, res: Response) => {
  const { value } = req.body
  if (![1,-1,0].includes(value)) { res.status(400).json({ message: 'Value must be 1, -1, or 0' }); return }
  const rid = req.params.id, uid = req.userId!
  if (value === 0) {
    await query(`DELETE FROM votes WHERE user_id=$1 AND report_id=$2`, [uid, rid])
  } else {
    await query(
      `INSERT INTO votes(user_id,report_id,value) VALUES($1,$2,$3)
       ON CONFLICT(user_id,report_id) DO UPDATE SET value=$3`,
      [uid, rid, value]
    )
  }
  const [ups, downs] = await Promise.all([
    queryOne<{count:string}>(`SELECT COUNT(*) FROM votes WHERE report_id=$1 AND value=1`,  [rid]),
    queryOne<{count:string}>(`SELECT COUNT(*) FROM votes WHERE report_id=$1 AND value=-1`, [rid]),
  ])
  const upvotes = parseInt(ups?.count ?? '0'), downvotes = parseInt(downs?.count ?? '0')
  await query(`UPDATE reports SET upvotes=$1,downvotes=$2 WHERE id=$3`, [upvotes, downvotes, rid])
  res.json({ upvotes, downvotes })
})

export default router