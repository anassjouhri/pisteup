import { cache } from '../config/cache'

const TOKEN = process.env.MAPBOX_TOKEN ?? ''

export async function reverseGeocode(lat: number, lng: number): Promise<{ name: string; countryCode: string } | null> {
  if (!TOKEN) return null
  const key = `geo:${lat.toFixed(3)},${lng.toFixed(3)}`
  const cached = cache.get(key)
  if (cached) return JSON.parse(cached)
  try {
    const res  = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place,locality,country&access_token=${TOKEN}`)
    const json = await res.json() as { features: { place_name: string; properties: { short_code?: string } }[] }
    if (!json.features?.length) return null
    const f = json.features[0]
    const result = { name: f.place_name.split(',')[0].trim(), countryCode: f.properties.short_code?.toUpperCase().slice(0, 2) ?? '' }
    cache.set(key, JSON.stringify(result), 86400)
    return result
  } catch { return null }
}

export async function searchPlaces(q: string, lat?: number, lng?: number) {
  if (!TOKEN) return []
  try {
    const prox = lat && lng ? `&proximity=${lng},${lat}` : ''
    const res  = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${TOKEN}${prox}&limit=5`)
    const json = await res.json() as { features: { place_name: string; geometry: { coordinates: [number,number] }; place_type: string[] }[] }
    return (json.features ?? []).map(f => ({
      name:   f.place_name,
      coords: { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] },
      type:   f.place_type[0],
    }))
  } catch { return [] }
}
