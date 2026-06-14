import axios from 'axios'

const api = axios.create({
  baseURL: '/api',           // Vite dev proxy forwards to http://localhost:8000/api
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: attach access token to every request ──────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor: silent token refresh on 401 ───────────────────────
let isRefreshing = false
// Queue of requests that arrived while a refresh was already in flight
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token!)))
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    // Only attempt refresh once per request (flag _retry prevents infinite loops)
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    const refresh = localStorage.getItem('refresh')
    if (!refresh) {
      // No refresh token — force login
      window.location.href = '/login'
      return Promise.reject(error)
    }

    if (isRefreshing) {
      // Another refresh is already in flight — queue this request
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      })
    }

    original._retry  = true
    isRefreshing     = true

    try {
      const { data } = await axios.post('/api/users/token/refresh/', { refresh })
      localStorage.setItem('access', data.access)
      processQueue(null, data.access)
      original.headers.Authorization = `Bearer ${data.access}`
      return api(original)
    } catch (err) {
      processQueue(err, null)
      localStorage.removeItem('access')
      localStorage.removeItem('refresh')
      window.location.href = '/login'
      return Promise.reject(err)
    } finally {
      isRefreshing = false
    }
  }
)

export default api
