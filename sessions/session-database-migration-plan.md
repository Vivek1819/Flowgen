# Fix Database Deployment Issue (SQLite to Turso Migration)

The goal was to migrate from a local SQLite database to **Turso** (LibSQL) for Vercel compatibility.

## Proposed Changes

### Prisma Configuration
- Added `driverAdapters` to `previewFeatures` in `schema.prisma`.

### Database Client
- Created a centralized Prisma client (`lib/prisma.ts`) that detects environment and uses the LibSQL adapter for cloud deployments.

### API Routes
- Updated all routes to use the shared singleton `prisma` instance.
