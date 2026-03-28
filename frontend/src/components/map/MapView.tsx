import { useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { reportsApi } from '@/services/api'
import { useMapStore } from '@/store'
import { realtimeService } from '@/services/realtime'
import type { Report, ReportType } from '@/types'

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

const PIN_COLOR: Record<ReportType, string> = {
  road: '#5B8FA8', border: '#E8622A', camp: '#7AB050',
  fuel: '#C8A96E', mechanic: '#8B6F47', hazard: '#CC3333',
}

interface MapViewProps {
  onReportClick?: (report: Report) => void
  onMapClick?: (lat: number, lng: number) => void
  reports: Report[]
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
        properties: {
          id:    r.id,
          type:  r.type,
          title: r.title,
          color: PIN_COLOR[r.type] ?? '#C8A96E',
        },
      })),
  }
}

export function MapView({ onReportClick, onMapClick, reports, onReportsLoad }: MapViewProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<maplibregl.Map | null>(null)
  const reportsRef    = useRef<Report[]>(reports)
  const sourceReady   = useRef(false)
  const { setCenter } = useMapStore()

  useEffect(() => { reportsRef.current = reports }, [reports])

  const loadReports = useCallback(async (map: maplibregl.Map) => {
    const zoom = map.getZoom()
    const b    = map.getBounds()
    if (!b) return

    try {
      // Below zoom 5 — fetch globally (no bbox), so clusters appear everywhere
      // Above zoom 5 — fetch only what's in the viewport for performance
      const params = zoom < 5
        ? { pageSize: 500 }
        : {
            swLat: b.getSouth(), swLng: b.getWest(),
            neLat: b.getNorth(), neLng: b.getEast(),
            pageSize: 500,
          }

      const { data } = await reportsApi.list(params)
      onReportsLoad(data.data)
    } catch (err) { console.error('Failed to load reports:', err) }
  }, [onReportsLoad])

  // Update GeoJSON source whenever reports prop changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !sourceReady.current) return
    const source = map.getSource('reports') as maplibregl.GeoJSONSource | undefined
    source?.setData(toGeoJSON(reports))
  }, [reports])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style:     MAP_STYLE,
      center:    [0, 20],
      zoom:      3,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right')
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')

    map.on('load', async () => {
      // Add source
      map.addSource('reports', {
        type:          'geojson',
        data:          toGeoJSON([]),
        cluster:       true,
        clusterMaxZoom: 9,
        clusterRadius:  50,
      })

      // Cluster circles
      map.addLayer({
        id:     'clusters',
        type:   'circle',
        source: 'reports',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step', ['get', 'point_count'],
            '#C8A96E', 10, '#E8622A', 30, '#CC3333',
          ],
          'circle-radius': [
            'step', ['get', 'point_count'],
            20, 10, 26, 30, 34,
          ],
          'circle-opacity':       0.92,
          'circle-stroke-width':  2,
          'circle-stroke-color':  'rgba(255,255,255,0.8)',
        },
      })

      // Cluster count labels
      map.addLayer({
        id:     'cluster-count',
        type:   'symbol',
        source: 'reports',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': '{point_count_abbreviated}',
          'text-size':  13,
          'text-font':  ['Open Sans Bold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#fff' },
      })

      // Individual pins
      map.addLayer({
        id:     'unclustered-point',
        type:   'circle',
        source: 'reports',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color':        ['get', 'color'],
          'circle-radius':       8,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.85)',
          'circle-opacity':      0.95,
        },
      })

      sourceReady.current = true

      // Load reports immediately after layers are ready
      await loadReports(map)
    })

    // Click cluster → zoom in
    map.on('click', 'clusters', (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] })
      if (!features.length) return
      const clusterId = features[0].properties?.cluster_id
      const source    = map.getSource('reports') as maplibregl.GeoJSONSource
      source.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || zoom == null) return
        const coords = (features[0].geometry as GeoJSON.Point).coordinates as [number, number]
        map.easeTo({ center: coords, zoom: zoom + 0.5 })
      })
    })

    // Click individual pin → open report
    map.on('click', 'unclustered-point', (e) => {
      const feature = e.features?.[0]
      if (!feature) return
      const id     = feature.properties?.id
      const report = reportsRef.current.find(r => r.id === id)
      if (report) {
        e.originalEvent.stopPropagation()
        onReportClick?.(report)
      }
    })

    // Click empty map → add report
    map.on('click', (e) => {
      const hit = map.queryRenderedFeatures(e.point, {
        layers: ['clusters', 'unclustered-point'],
      })
      if (hit.length === 0) onMapClick?.(e.lngLat.lat, e.lngLat.lng)
    })

    // Cursor
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
    return () => {
      sourceReady.current = false
      map.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Real-time new report
  useEffect(() => {
    const unsub = realtimeService.on('report:new', () => {
      if (mapRef.current) loadReports(mapRef.current)
    })
    return () => unsub()
  }, [loadReports])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}