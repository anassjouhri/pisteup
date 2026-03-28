import 'dotenv/config'
import http from 'node:http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'

import { pool } from './config/db'
import { initSocket } from './services/socket'
import authRoutes from './routes/auth'
import reportsRoutes from './routes/reports'
import { feedRouter, usersRouter, tripsRouter, geoRouter } from './routes/rest'

const app    = express()
const server = http.createServer(app)

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173', credentials: true }))
app.use(compression())
app.use(express.json({ limit: '2mb' }))
app.use(morgan('dev'))

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))
app.use('/api/auth',    authRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/feed',    feedRouter)
app.use('/api/users',   usersRouter)
app.use('/api/trips',   tripsRouter)
app.use('/api/geo',     geoRouter)

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.message)
  res.status(500).json({ message: 'Internal server error' })
})

const PORT = Number(process.env.PORT ?? 4000)

async function boot() {
  const client = await pool.connect()
  await client.query('SELECT 1')
  client.release()
  console.log('✅  Database connected (Supabase)')
  initSocket(server)
  server.listen(PORT, () => console.log(`🚀  PisteUp API → http://localhost:${PORT}`))
}

boot().catch(err => { console.error('Boot failed:', err.message); process.exit(1) })

process.on('SIGTERM', async () => {
  await pool.end()
  server.close(() => process.exit(0))
})
