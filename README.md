# PisteUp

The social network for overland travellers.

## Setup

### 1. Supabase (database)
1. Create a project at supabase.com
2. SQL Editor → run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   ```
3. SQL Editor → paste contents of `backend/sql/001_init.sql` → Run
4. Settings → Database → Connection string → URI → copy it

### 2. Backend
```bash
cd backend
npm install
copy .env.example .env    # Windows
# Edit .env — paste your Supabase DATABASE_URL
npm run dev               # → http://localhost:4000
```

### 3. Frontend
```bash
cd frontend
npm install
copy .env.example .env    # Windows
# No map token needed — uses OpenFreeMap (free OSM tiles)
npm run dev               # → http://localhost:5173
```

## Map
Uses **MapLibre GL** with **OpenFreeMap** tiles (OpenStreetMap data).
- 100% free, no account, no token, no limits
- Better data than Google/Mapbox for remote tracks and pistes
- OSM community actively maps overland routes, border crossings, campsites

## Stack
- Frontend: React 18 + TypeScript + Vite + MapLibre GL
- Backend: Node.js + Express + TypeScript
- Database: Supabase (PostgreSQL + PostGIS)
- Real-time: Socket.io
