import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { reportsApi, tracksApi, type Track } from '@/services/api'
import { useMapStore } from '@/store'
import { realtimeService } from '@/services/realtime'
import type { Report, ReportType } from '@/types'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

const PIN_COLOR: Record<ReportType, string> = {
  road: '#5B8FA8', border: '#E8622A', camp: '#7AB050',
  fuel: '#C8A96E', mechanic: '#8B6F47', hazard: '#CC3333',
}

const TRACK_COLORS = ['#E8622A','#5B8FA8','#7AB050','#C8A96E','#CC3333','#8B6F47']

export interface MapViewHandle {
  flyTo: (lng: number, lat: number) => void
  fitTrack: (track: Track) => void
}

interface MapViewProps {
  onReportClick?: (report: Report) => void
  onMapClick?: (lat: number, lng: number) => void
  reports: Report[]
  tracks: Track[]
  showTracks: boolean
  onReportsLoad: (reports: Report[]) => void
}

function toGeoJSON(reps: Report[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: reps
      .filter(r => r.lat != null && r.lng != null)
      .map(r => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
        properties: { id: r.id, type: r.type, title: r.title, color: PIN_COLOR[r.type] ?? '#C8A96E' },
      })),
  }
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(
  function MapView({ onReportClick, onMapClick, reports, tracks, showTracks, onReportsLoad }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const mapRef       = useRef<maplibregl.Map | null>(null)
    const reportsRef   = useRef<Report[]>(reports)
    const tracksRef    = useRef<Track[]>(tracks)
    const sourceReady  = useRef(false)
    const trackLayerIds = useRef<string[]>([])
    const { setCenter } = useMapStore()

    useEffect(() => { reportsRef.current = reports }, [reports])
    useEffect(() => { tracksRef.current = tracks }, [tracks])

    useImperativeHandle(ref, () => ({
      flyTo: (lng, lat) => {
        const map = mapRef.current
        if (!map) return
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 12), speed: 1.4 })
      },
      fitTrack: (track) => {
        const map = mapRef.current
        if (!map) return
        map.fitBounds(
          [[track.bbox_sw_lng, track.bbox_sw_lat], [track.bbox_ne_lng, track.bbox_ne_lat]],
          { padding: 60, duration: 800 }
        )
      },
    }))

    const loadReports = useCallback(async (map: maplibregl.Map) => {
      const zoom = map.getZoom()
      const b    = map.getBounds()
      if (!b) return
      try {
        const params = zoom < 5 ? { pageSize: 500 } : {
          swLat: b.getSouth(), swLng: b.getWest(),
          neLat: b.getNorth(), neLng: b.getEast(), pageSize: 500,
        }
        const { data } = await reportsApi.list(params)
        onReportsLoad(data.data)
      } catch (err) { console.error('Failed to load reports:', err) }
    }, [onReportsLoad])

    // Update reports GeoJSON source
    useEffect(() => {
      const map = mapRef.current
      if (!map || !sourceReady.current) return
      const source = map.getSource('reports') as maplibregl.GeoJSONSource | undefined
      source?.setData(toGeoJSON(reports))
    }, [reports])

    // Render tracks as line layers
    useEffect(() => {
      const map = mapRef.current
      if (!map || !sourceReady.current) return

      // Remove old track layers and sources
      trackLayerIds.current.forEach(id => {
        if (map.getLayer(id))   map.removeLayer(id)
        if (map.getLayer(id + '-outline')) map.removeLayer(id + '-outline')
        if (map.getSource(id))  map.removeSource(id)
      })
      trackLayerIds.current = []

      if (!showTracks || tracks.length === 0) return

      // Add each track as its own source + layer
      tracks.forEach(async (track, i) => {
        const sourceId = `track-${track.id}`
        if (map.getSource(sourceId)) return

        try {
          const { data } = await tracksApi.get(track.id)
          if (!data.geojson || !map.getSource) return

          map.addSource(sourceId, {
            type: 'geojson',
            data: { type: 'Feature', geometry: data.geojson, properties: { id: track.id, title: track.title } },
          })

          const color = TRACK_COLORS[i % TRACK_COLORS.length]

          // Outline (thicker, semi-transparent)
          map.addLayer({
            id:     sourceId + '-outline',
            type:   'line',
            source: sourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint:  { 'line-color': '#000', 'line-width': 5, 'line-opacity': 0.25 },
          })

          // Main line
          map.addLayer({
            id:     sourceId,
            type:   'line',
            source: sourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint:  { 'line-color': color, 'line-width': 3, 'line-opacity': 0.9 },
          })

          // Click handler
          map.on('click', sourceId, (e) => {
            const t = tracksRef.current.find(t => t.id === track.id)
            if (!t) return
            e.originalEvent.stopPropagation()
            new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
              .setLngLat(e.lngLat)
              .setHTML(`
                <div style="font-family:sans-serif;padding:4px">
                  <div style="font-weight:600;font-size:13px;margin-bottom:4px">${t.title}</div>
                  <div style="font-size:11px;color:#888">
                    ${t.distance_km} km
                    ${t.elevation_gain_m ? ` · +${t.elevation_gain_m}m` : ''}
                    ${t.surface_type ? ` · ${t.surface_type}` : ''}
                    ${t.difficulty ? ` · ${t.difficulty}` : ''}
                  </div>
                  ${t.description ? `<div style="font-size:12px;margin-top:6px;color:#555">${t.description.slice(0,120)}${t.description.length > 120 ? '…' : ''}</div>` : ''}
                  <div style="font-size:11px;color:#888;margin-top:4px">by ${t.author.displayName}</div>
                </div>
              `)
              .addTo(map)
          })

          map.on('mouseenter', sourceId, () => { map.getCanvas().style.cursor = 'pointer' })
          map.on('mouseleave', sourceId, () => { map.getCanvas().style.cursor = '' })

          trackLayerIds.current.push(sourceId)
        } catch (err) { console.error('Failed to load track:', err) }
      })
    }, [tracks, showTracks])

    useEffect(() => {
      if (!containerRef.current || mapRef.current) return

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE, center: [0, 20], zoom: 3,
        attributionControl: false,
      })

      map.addControl(new maplibregl.NavigationControl(), 'bottom-right')
      map.addControl(new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true }, trackUserLocation: true,
      }), 'bottom-right')
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

      map.on('load', async () => {
        map.addSource('reports', {
          type: 'geojson', data: toGeoJSON([]),
          cluster: true, clusterMaxZoom: 9, clusterRadius: 50,
        })

        map.addLayer({
          id: 'clusters', type: 'circle', source: 'reports',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': ['step', ['get', 'point_count'], '#C8A96E', 10, '#E8622A', 30, '#CC3333'],
            'circle-radius': ['step', ['get', 'point_count'], 20, 10, 26, 30, 34],
            'circle-opacity': 0.92, 'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(255,255,255,0.8)',
          },
        })

        map.addLayer({
          id: 'cluster-count', type: 'symbol', source: 'reports',
          filter: ['has', 'point_count'],
          layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 13, 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'] },
          paint: { 'text-color': '#fff' },
        })

        map.addLayer({
          id: 'unclustered-point', type: 'circle', source: 'reports',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': ['get', 'color'], 'circle-radius': 8,
            'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(255,255,255,0.85)', 'circle-opacity': 0.95,
          },
        })

        sourceReady.current = true
        await loadReports(map)
      })

      map.on('click', 'clusters', (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
        if (!features.length) return
        const clusterId = features[0].properties?.cluster_id
        const source = map.getSource('reports') as maplibregl.GeoJSONSource
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom == null) return
          const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number]
          map.easeTo({ center: coords, zoom: zoom + 0.5 })
        })
      })

      map.on('click', 'unclustered-point', (e) => {
        const feature = e.features?.[0]
        if (!feature) return
        const id = feature.properties?.id
        const report = reportsRef.current.find(r => r.id === id)
        if (report) { e.originalEvent.stopPropagation(); onReportClick?.(report) }
      })

      map.on('click', (e) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: ['clusters', 'unclustered-point'] })
        if (hit.length === 0) onMapClick?.(e.lngLat.lat, e.lngLat.lng)
      })

      ;['clusters', 'unclustered-point'].forEach(layer => {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
      })

      map.on('moveend', () => {
        const c = map.getCenter()
        setCenter([c.lng, c.lat], map.getZoom())
        loadReports(map)
      })

      mapRef.current = map
      return () => { sourceReady.current = false; map.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
      const unsub = realtimeService.on('report:new', () => {
        if (mapRef.current) loadReports(mapRef.current)
      })
      return () => unsub()
    }, [loadReports])

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
  }
)