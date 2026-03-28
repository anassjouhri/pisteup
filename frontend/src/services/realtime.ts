import { io, type Socket } from 'socket.io-client'

type Handler<T> = (data: T) => void

class RealtimeService {
  private socket: Socket | null = null
  private handlers = new Map<string, Set<Handler<unknown>>>()

  connect(token: string) {
    if (this.socket?.connected) return
    this.socket = io(import.meta.env.VITE_WS_URL ?? 'http://localhost:4000', {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    })
    this.socket.on('connect', () => console.info('[PisteUp RT] connected'))
    this.socket.on('disconnect', (r) => console.info('[PisteUp RT] disconnected:', r))
    ;['traveller:move','traveller:online','traveller:offline','report:new','report:updated','border:alert']
      .forEach(ev => this.socket!.on(ev, (d) => this.emit(ev, d)))
  }

  disconnect() { this.socket?.disconnect(); this.socket = null }

  publishLocation(lat: number, lng: number, heading?: number) {
    this.socket?.emit('location:update', { lat, lng, heading })
  }

  subscribeToMap(bounds: { swLat: number; swLng: number; neLat: number; neLng: number }) {
    this.socket?.emit('map:subscribe', bounds)
  }

  on<T>(event: string, handler: Handler<T>) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler as Handler<unknown>)
    return () => this.handlers.get(event)?.delete(handler as Handler<unknown>)
  }

  private emit(event: string, data: unknown) {
    this.handlers.get(event)?.forEach(h => h(data))
  }
}

export const realtimeService = new RealtimeService()
