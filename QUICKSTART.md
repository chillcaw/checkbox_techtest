# Quick Start Guide - Assessment Boilerplate

## For Candidates

### 1. Prerequisites Check

```bash
./verify-setup.sh
```

**Required**:
- Docker Desktop (or Docker + Docker Compose)
- 8GB RAM minimum
- 10GB free disk space

### 2. Start the System

```bash
docker compose up
```

**What happens**:
- ✓ PostgreSQL starts and initializes
- ✓ Database schema is created
- ✓ 10,000 matters are seeded (~2-3 minutes)
- ✓ Backend API starts
- ✓ Frontend builds and serves

### 3. Verify It's Running

**Frontend**: http://localhost:8080  
You should see a table with 10,000 matters. Note the "TODO" placeholders for:
- Search bar (yellow warning box)
- Resolution Time column
- SLA column

**Backend API**: http://localhost:3000/api/v1/matters  
You should get JSON with paginated matters

**Health Check**: http://localhost:3000/health  
Should return `{"status": "healthy"}`

### 4. Explore the Boilerplate

```bash
# Backend structure
cd backend/src
ls -la ticketing/matter/

# Frontend structure  
cd frontend/src
ls -la components/
```

**Key Files to Implement**:
- `backend/src/ticketing/matter/service/cycle_time_service.ts` - Cycle time logic
- `backend/src/ticketing/matter/repo/matter_repo.ts` - Search functionality
- `frontend/src/App.tsx` - Add search bar
- `frontend/src/components/MatterTable.tsx` - Add cycle time/SLA display
- `backend/src/ticketing/matter/service/__tests__/` - Add tests

### 5. Development Mode (Hot Reload)

```bash
docker compose -f docker-compose.dev.yml up
```

- Backend hot reloads on file changes
- Frontend hot reloads at http://localhost:5173

### 6. Make Your First Change

Try updating the placeholder in `cycle_time_service.ts`:

```typescript
// Change this:
return 'N/A';

// To this:
return '2h 30m';
```

Restart and check if it shows in the UI.

### 7. Run Tests (Once You've Added Them)

```bash
cd backend
npm test
npm run test:coverage
```

## Development Workflow

1. **Understand the schema** - Review `database/schema.sql`
2. **Review existing patterns** - See how other repos/services work
3. **Start with backend** - Implement cycle times first
4. **Add tests as you go** - Don't wait until the end
5. **Then frontend** - Connect cycle times to UI
6. **Add search** - Backend then frontend
7. **Document scalability** - Update README

## Useful Commands

```bash
# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Restart a service
docker compose restart backend

# Stop everything
docker compose down

# Clean slate (removes volumes)
docker compose down -v

# Run linter
cd backend && npm run lint
cd frontend && npm run lint
```

## Troubleshooting

### Port Already in Use

```bash
# Find what's using the port
lsof -i :3000
lsof -i :8080

# Kill or change port in docker-compose.yml
```

### Database Connection Failed

```bash
# Check database logs
docker compose logs postgres

# Verify it's running
docker compose ps
```

### Seed Takes Too Long

Creating 10,000 matters with cycle time histories takes 2-3 minutes. This is normal.

```bash
# Watch seed progress
docker compose logs -f seed
```

### Frontend Not Showing Data

1. Check backend is running: http://localhost:3000/health
2. Check browser console for errors
3. Verify API returns data: http://localhost:3000/api/v1/matters

### TypeScript Errors

```bash
cd backend
npm run tsc

cd frontend
npm run build
```

## Sample API Calls

```bash
# Get first page
curl http://localhost:3000/api/v1/matters?page=1&limit=10

# Get specific matter
curl http://localhost:3000/api/v1/matters/{MATTER_ID}

# Get field definitions
curl http://localhost:3000/api/v1/fields

# Health check
curl http://localhost:3000/health
```

## What You Should See

**Working** ✅:
- Table with 10,000 matters
- Pagination (page through data)
- Sorting (click column headers)
- All field types displayed (text, number, date, currency, etc.)

**Not Working** ❌ (You implement these):
- Search bar (shows yellow warning)
- Resolution Time column (shows "Not implemented")
- SLA column (shows "Not implemented")
- Tests (directory exists but empty)

## Next Steps

1. Read [ASSESSMENT.md](./ASSESSMENT.md) for full requirements
2. Review database schema in `database/schema.sql`
3. Understand the cycle time history table
4. Start implementing `CycleTimeService`
5. Add tests as you go
6. Implement search
7. Update README with your approach and scalability analysis

## Remember

- **Quality over speed** - Production-grade code matters
- **Test as you go** - Don't save testing for the end
- **Document decisions** - README is as important as code
- **Think about scale** - How would this handle 10× load?
- **Use AI if helpful** - But disclose and understand what you submit

## Questions?

Include your questions in your README submission. Good luck! 🚀
