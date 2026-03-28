import 'dotenv/config'
import { Pool, type PoolClient } from 'pg'

if (!process.env.DATABASE_URL) {
  console.error('\n❌  DATABASE_URL is not set.')
  console.error('    Copy backend/.env.example to backend/.env')
  console.error('    and paste your Supabase connection string.\n')
  process.exit(1)
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

pool.on('error', (err) => console.error('[DB] Pool error:', err.message))

export async function query<T extends Record<string, unknown>>(
  sql: string, params?: unknown[]
): Promise<T[]> {
  const { rows } = await pool.query<T>(sql, params)
  return rows
}

export async function queryOne<T extends Record<string, unknown>>(
  sql: string, params?: unknown[]
): Promise<T | null> {
  const { rows } = await pool.query<T>(sql, params)
  return rows[0] ?? null
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
