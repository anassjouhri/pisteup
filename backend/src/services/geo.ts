import { cache } from '../config/cache'

const NOMINATIM = 'https://nominatim.openstreetmap.org'
const HEADERS   = { 'User-Agent': 'PisteUp/1.0 (overland travel app)' }
// Nominatim requires a User-Agent header — use your app name

export async function reverseGeocode(lat: number, lng: number): Promise<{ name: string; countryCode: string } | null> {
  const key = `geo:rev:${lat.toFixed(3)},${lng.toFixed(3)}`
  const cached = cache.get(key)
  if (cached) return JSON.parse(cached)
  try {
    const res  = await fetch(`${NOMINATIM}/reverse?lat=${lat}&lon=${lng}&format=json`, { headers: HEADERS })
    const json = await res.json() as { display_name?: string; address?: { country_code?: string; city?: string; town?: string; village?: string; county?: string } }
    if (!json.address) return null
    const name = json.address.city ?? json.address.town ?? json.address.village ?? json.address.county ?? json.display_name?.split(',')[0] ?? ''
    const result = { name, countryCode: json.address.country_code?.toUpperCase() ?? '' }
    cache.set(key, JSON.stringify(result), 86400)
    return result
  } catch { return null }
}

export async function searchPlaces(q: string, lat?: number, lng?: number) {
  const key = `geo:search:${q}:${lat?.toFixed(2)}:${lng?.toFixed(2)}`
  const cached = cache.get(key)
  if (cached) return JSON.parse(cached)
  try {
    const viewbox = lat && lng
      ? `&viewbox=${lng - 10},${lat - 10},${lng + 10},${lat + 10}&bounded=0`
      : ''
    const url = `${NOMINATIM}/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1${viewbox}`
    const res  = await fetch(url, { headers: HEADERS })
    const json = await res.json() as { display_name: string; lat: string; lon: string; type: string }[]
    const results = json.map(f => ({
      name:   f.display_name,
      coords: { lat: parseFloat(f.lat), lng: parseFloat(f.lon) },
      type:   f.type,
    }))
    cache.set(key, JSON.stringify(results), 3600)
    return results
  } catch { return [] }
}