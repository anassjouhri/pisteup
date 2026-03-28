import { create } from 'zustand'
import type { User, Report, Post } from '@/types'

interface AuthStore {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string, refresh: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  token: localStorage.getItem('pisteup_token'),
  setAuth: (user, token, refresh) => {
    localStorage.setItem('pisteup_token', token)
    localStorage.setItem('pisteup_refresh', refresh)
    set({ user, token })
  },
  clearAuth: () => {
    localStorage.removeItem('pisteup_token')
    localStorage.removeItem('pisteup_refresh')
    set({ user: null, token: null })
  },
}))

interface MapStore {
  center: [number, number]
  zoom: number
  selectedReport: Report | null
  setCenter: (c: [number, number], z: number) => void
  setSelectedReport: (r: Report | null) => void
}

export const useMapStore = create<MapStore>()((set) => ({
  center: [0, 20],
  zoom: 3,
  selectedReport: null,
  setCenter: (center, zoom) => set({ center, zoom }),
  setSelectedReport: (selectedReport) => set({ selectedReport }),
}))

interface FeedStore {
  posts: Post[]
  hasMore: boolean
  page: number
  isLoading: boolean
  setPosts: (p: Post[]) => void
  appendPosts: (p: Post[]) => void
  setHasMore: (v: boolean) => void
  setPage: (p: number) => void
  setLoading: (v: boolean) => void
}

export const useFeedStore = create<FeedStore>()((set) => ({
  posts: [],
  hasMore: true,
  page: 1,
  isLoading: false,
  setPosts: (posts) => set({ posts }),
  appendPosts: (more) => set((s) => ({ posts: [...s.posts, ...more] })),
  setHasMore: (hasMore) => set({ hasMore }),
  setPage: (page) => set({ page }),
  setLoading: (isLoading) => set({ isLoading }),
}))
