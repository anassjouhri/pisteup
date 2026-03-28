import rateLimit from 'express-rate-limit'

export const authLimiter   = rateLimit({ windowMs: 15*60*1000, max: 20,  message: { message: 'Too many requests' } })
export const reportLimiter = rateLimit({ windowMs: 60*60*1000, max: 30,  message: { message: 'Report limit reached' } })
