// ─────────────────────────────────────────────
// GPX Parser — pure Node.js, no dependencies
// Parses GPX XML and extracts track coordinates
// ─────────────────────────────────────────────

export interface TrackPoint {
  lat:       number
  lng:       number
  elevation: number | null
  timestamp: string | null
  seq:       number
}

export interface ParsedTrack {
  name:           string
  description:    string
  points:         TrackPoint[]
  distanceKm:     number
  elevationGainM: number
  bbox:           { swLat: number; swLng: number; neLat: number; neLng: number }
}

function getAttr(tag: string, attr: string): string | null {
  const m = tag.match(new RegExp(`${attr}="([^"]*)"`, 'i'))
  return m ? m[1] : null
}

function getTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return m ? m[1].trim() : null
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

export function parseGpx(xml: string): ParsedTrack {
  const name        = getTag(xml, 'name') ?? 'Unnamed track'
  const description = getTag(xml, 'desc') ?? ''

  // Extract all trkpt elements
  const trkptRegex = /<trkpt([^>]*)>([\s\S]*?)<\/trkpt>/gi
  const points: TrackPoint[] = []
  let match: RegExpExecArray | null
  let seq = 0

  while ((match = trkptRegex.exec(xml)) !== null) {
    const attrs   = match[1]
    const content = match[2]
    const lat = parseFloat(getAttr(attrs, 'lat') ?? 'NaN')
    const lng = parseFloat(getAttr(attrs, 'lon') ?? 'NaN')
    if (isNaN(lat) || isNaN(lng)) continue

    const eleMatch = content.match(/<ele>([\s\S]*?)<\/ele>/i)
    const timeMatch = content.match(/<time>([\s\S]*?)<\/time>/i)

    points.push({
      lat,
      lng,
      elevation: eleMatch ? parseFloat(eleMatch[1]) : null,
      timestamp: timeMatch ? timeMatch[1].trim() : null,
      seq: seq++,
    })
  }

  // Also handle wpt elements if no trkpt found
  if (points.length === 0) {
    const wptRegex = /<wpt([^>]*)>([\s\S]*?)<\/wpt>/gi
    while ((match = wptRegex.exec(xml)) !== null) {
      const attrs   = match[1]
      const content = match[2]
      const lat = parseFloat(getAttr(attrs, 'lat') ?? 'NaN')
      const lng = parseFloat(getAttr(attrs, 'lon') ?? 'NaN')
      if (isNaN(lat) || isNaN(lng)) continue
      const eleMatch = content.match(/<ele>([\s\S]*?)<\/ele>/i)
      points.push({ lat, lng, elevation: eleMatch ? parseFloat(eleMatch[1]) : null, timestamp: null, seq: seq++ })
    }
  }

  if (points.length < 2) throw new Error('GPX file must contain at least 2 track points')

  // Calculate distance and elevation gain
  let distanceKm = 0
  let elevationGainM = 0
  for (let i = 1; i < points.length; i++) {
    distanceKm += haversineKm(points[i-1].lat, points[i-1].lng, points[i].lat, points[i].lng)
    if (points[i].elevation != null && points[i-1].elevation != null) {
      const diff = points[i].elevation! - points[i-1].elevation!
      if (diff > 0) elevationGainM += diff
    }
  }

  // Bounding box
  const lats = points.map(p => p.lat)
  const lngs = points.map(p => p.lng)
  const bbox = {
    swLat: Math.min(...lats), swLng: Math.min(...lngs),
    neLat: Math.max(...lats), neLng: Math.max(...lngs),
  }

  return {
    name,
    description,
    points,
    distanceKm: Math.round(distanceKm * 10) / 10,
    elevationGainM: Math.round(elevationGainM),
    bbox,
  }
}