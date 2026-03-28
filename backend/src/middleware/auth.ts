import { type Request, type Response, type NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export const JWT_SECRET  = process.env.JWT_SECRET  ?? 'dev_secret_min_32_chars_change_me!!'
export const JWT_REFRESH = process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_min_32_chars_change!!'

export interface AuthRequest extends Request { userId?: string }

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ message: 'Missing token' }); return }
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET) as { sub: string }
    req.userId = payload.sub
    next()
  } catch { res.status(401).json({ message: 'Invalid or expired token' }) }
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), JWT_SECRET) as { sub: string }
      req.userId = payload.sub
    } catch {}
  }
  next()
}
