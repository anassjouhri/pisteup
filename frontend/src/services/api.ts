import axios from 'axios'
import type { AuthResponse, User, Report, Post, Comment, Trip, PaginatedResponse } from '@/types'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
  timeout: 15_000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pisteup_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      const refresh = localStorage.getItem('pisteup_refresh')
      if (refresh && !error.config._retry) {
        error.config._retry = true
        try {
          const { data } = await axios.post(
            `${api.defaults.baseURL}/auth/refresh`,
            { refreshToken: refresh }
          )
          localStorage.setItem('pisteup_token', data.token)
          error.config.headers.Authorization = `Bearer ${data.token}`
          return api(error.config)
        } catch {
          localStorage.clear()
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  register: (b: { username: string; email: string; password: string; displayName: string }) =>
    api.post<AuthResponse>('/auth/register', b),
  login: (b: { email: string; password: string }) =>
    api.post<AuthResponse>('/auth/login', b),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<User>('/auth/me'),
  refresh: (refreshToken: string) => api.post<{ token: string }>('/auth/refresh', { refreshToken }),
}

export const reportsApi = {
  list: (params: Record<string, unknown>) =>
    api.get<PaginatedResponse<Report>>('/reports', { params }),
  get: (id: string) => api.get<Report>(`/reports/${id}`),
  create: (body: Record<string, unknown>) => api.post<Report>('/reports', body),
  update: (id: string, body: Record<string, unknown>) => api.patch<Report>(`/reports/${id}`, body),
  delete: (id: string) => api.delete(`/reports/${id}`),
  vote: (id: string, value: 1 | -1 | 0) =>
    api.post<{ upvotes: number; downvotes: number }>(`/reports/${id}/vote`, { value }),
}

export const feedApi = {
  list: (params?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Post>>('/feed', { params }),
  get: (id: string) => api.get<Post>(`/feed/${id}`),
  create: (body: Record<string, unknown>) => api.post<Post>('/feed', body),
  delete: (id: string) => api.delete(`/feed/${id}`),
  vote: (id: string, value: 1 | -1 | 0) =>
    api.post<{ upvotes: number }>(`/feed/${id}/vote`, { value }),
  comments: (id: string) => api.get<Comment[]>(`/feed/${id}/comments`),
  addComment: (id: string, content: string) =>
    api.post<Comment>(`/feed/${id}/comments`, { content }),
}

export const usersApi = {
  get: (username: string) => api.get<User>(`/users/${username}`),
  me: () => api.get<User>('/users/me'),
  update: (body: Record<string, unknown>) => api.patch<User>('/users/me', body),
  trips: (username: string) => api.get<Trip[]>(`/users/${username}/trips`),
  follow: (id: string) => api.post(`/users/${id}/follow`),
  unfollow: (id: string) => api.delete(`/users/${id}/follow`),
}

export const tripsApi = {
  get: (id: string) => api.get<Trip>(`/trips/${id}`),
  create: (body: Record<string, unknown>) => api.post<Trip>('/trips', body),
  addWaypoint: (id: string, body: Record<string, unknown>) =>
    api.post(`/trips/${id}/waypoints`, body),
}

export const geoApi = {
  search: (q: string, lat?: number, lng?: number) =>
    api.get('/geo/search', { params: { q, lat, lng } }),
  reverse: (lat: number, lng: number) =>
    api.get('/geo/reverse', { params: { lat, lng } }),
}

export default api
