# Matter Management Take-Home Assessment

## Overview

Welcome to the Matter Management System technical assessment. This is designed to evaluate your system design, coding quality, scalability thinking, and architectural decision-making skills.

## Time Expectation

This assessment should take **4-8 hours** to complete. We value your time and recommend focusing on:
- **Quality over quantity** - Production-grade code matters more than feature completeness
- **Clear thinking** - Document your decisions and trade-offs
- **Scalability** - Think about how your solution scales to 10× the current load

## What's Provided (Boilerplate)

We've provided a working boilerplate to save you time on setup:

✅ **Database Setup**
- PostgreSQL schema with EAV pattern for flexible fields
- 10,000 pre-seeded matters with realistic data
- All 8 field types (text, number, select, date, currency, boolean, status, user)
- Cycle time history tracking table
- **See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete schema documentation**

✅ **Backend Structure**
- Node.js + Express + TypeScript
- Database connection pooling
- Basic API endpoints for listing and fetching matters
- Type definitions
- Error handling framework
- Logging setup

✅ **Frontend Structure**
- React + Vite + TypeScript + TailwindCSS
- Matter table with pagination
- Basic field display
- Sorting on `created_at` and `updated_at` only

✅ **Docker Setup**
- `docker compose up` starts everything
- Automatic database seeding
- Development and production modes

## Your Tasks

### 1. Implement Cycle Time Tracking & SLA Calculation ⏱️

**Backend** (`backend/src/ticketing/matter/service/cycle_time_service.ts`):

Implement the `CycleTimeService` to:
- Calculate resolution time from first status change to "Done" status
- For in-progress matters, calculate ongoing duration
- Determine SLA status:
  - **"In Progress"**: Not yet complete
  - **"Met"**: Resolved ≤ 8 hours
  - **"Breached"**: Resolved > 8 hours
- Format durations human-readable (e.g., "2h 30m", "3d 5h")

**Frontend** (`frontend/src/components/MatterTable.tsx`):
- Display resolution time column
- Display SLA column with color-coded badges:
  - Blue: In Progress
  - Green: Met
  - Red: Breached

**Database Queries**:
- Query `ticketing_cycle_time_histories` table
- Join with status groups and options
- Consider query performance

### 2. Implement Column Sorting 🔄

**Current State**:
- ✅ Frontend has sort UI on "Subject" column
- ✅ Backend only supports sorting by `created_at` and `updated_at`
- ❌ **Other columns are NOT sortable** (Case Number, Status, Priority, etc.)

**What You Need to Implement**:

**Backend** (`backend/src/ticketing/matter/repo/matter_repo.ts`):

Add sorting support for all field types:
- **Number fields**: Case Number (use `number_value` column)
- **Text fields**: Subject, Priority (use `string_value` column)
- **Date fields**: Due Date (use `date_value` column)
- **Status fields**: Sort by status label or group sequence
- **User fields**: Sort by user name
- **Currency fields**: Sort by amount
- **Boolean fields**: Sort by true/false

**Challenges**:
- EAV pattern means field values are in a separate table
- Need to join with `ticketing_ticket_field_value` efficiently
- Handle NULL values (not all matters have all fields)
- Avoid N+1 queries

**Frontend** (`frontend/src/components/MatterTable.tsx`):

Add sort click handlers to all column headers:
- Case Number
- Status
- Priority
- Assigned To
- Contract Value
- Urgent
- Due Date
- Resolution Time (after implementing Task 1)
- SLA (after implementing Task 1)

**Reference**: See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for detailed sorting implementation guidance and example queries.

### 3. Implement Search Functionality 🔍

**Backend** (`backend/src/ticketing/matter/repo/matter_repo.ts`):

Implement search across all fields:
- Text fields (subject, description)
- Number fields (case number)
- Status labels
- User names
- Currency values
- Dates
- Cycle times and SLA (after implementing Task 1)

**Frontend** (`frontend/src/App.tsx`):
- Add search bar component with debouncing (500ms recommended)
- Clear search button
- Show search state

**Performance**:
- Use PostgreSQL pg_trgm extension (already enabled in schema)
- Consider index usage
- Handle 10,000+ records efficiently

### 4. Write Tests 🧪

Add test coverage for:
- **Unit Tests**: Cycle time calculations, SLA determination, duration formatting
- **Integration Tests**: API endpoints with real database queries, sorting with different field types
- **Edge Cases**: NULL values, empty history, partial data, sorting with missing fields
- **Frontend Tests** (optional but valued): Component rendering, search behavior

Use the existing Vitest setup (`backend/vitest.config.ts`).

### 5. Document Scalability Strategy 📈

In your `README.md` submission, address:

**If this system needed to handle 10× the current load (100,000 matters, 1,000+ concurrent users), what would you do?**

Consider:
- Database optimization (indexes, materialized views, partitioning)
- Caching strategies (Redis, query caching)
- Application scaling (horizontal scaling, load balancing)
- Search optimization (Elasticsearch migration)
- Connection pooling adjustments
- Query optimization

Be specific and justify your choices with:
- Performance impact
- Complexity trade-offs
- Cost implications
- Implementation timeline

## AI Tool Usage 🤖

**You may use AI tools** (GitHub Copilot, ChatGPT, Claude, etc.), but:

✅ **We require**:
- Explain in your README which AI tools you used and how
- Describe what code was AI-generated vs human-written
- Justify why you used AI for specific parts
- **You are fully accountable** for all code submitted

❌ **Unacceptable**:
- Blindly copying AI-generated code without review
- Submitting code you don't understand
- Not testing AI-generated functionality

**Example good disclosure**:
> "I used GitHub Copilot to generate the initial cycle time calculation logic, then refactored it for better performance and added edge case handling. The SLA determination logic was written from scratch as I wanted to ensure correctness for the business logic."

## Production Readiness 🚀

Treat this as **production-ready code**. Consider:

**Security**:
- SQL injection prevention
- Input validation
- Error handling that doesn't leak implementation details

**Performance**:
- Query optimization
- Proper indexing
- Connection pooling
- N+1 query prevention

**Code Quality**:
- TypeScript strict mode compliance
- Clear variable names
- Proper error handling
- Logging for debugging

**Testing**:
- Edge cases (no history, partial history, large durations)
- Error conditions
- Performance under load

**Documentation**:
- Clear README with setup instructions
- Code comments for complex logic
- API documentation
- Architecture decisions

## Submission Requirements

Your submission should include:

1. **Working Code**
   - All implementations complete and tested
   - `docker compose up` starts successfully
   - All features demonstrated at http://localhost:8080

2. **README.md** (Updated)
   - Your approach and design decisions
   - Scalability analysis (10× load strategy)
   - AI tool usage disclosure
   - Setup instructions
   - Trade-offs you made
   - What you'd improve with more time

3. **Tests**
   - Test files in appropriate directories
   - Instructions to run tests
   - Coverage report (optional but valued)

4. **Code Quality**
   - Linting passes (`npm run lint`)
   - TypeScript compiles without errors
   - No console warnings

## Evaluation Criteria

We'll evaluate on:

### Technical Excellence (40%)
- Code quality and organization
- TypeScript usage and type safety
- Error handling
- Performance optimization

### System Design (25%)
- Database query design
- API design
- Architecture decisions
- Scalability thinking

### Problem Solving (20%)
- Correctness of cycle time calculation
- Search implementation quality
- Edge case handling
- Test coverage

### Communication (15%)
- README clarity
- Code documentation
- Trade-off justifications
- Scalability analysis depth

## Getting Started

```bash
# Verify prerequisites
./verify-setup.sh

# Read schema documentation (IMPORTANT!)
cat DATABASE_SCHEMA.md

# Start the system
docker compose up

# Access the application
open http://localhost:8080

# View backend API
open http://localhost:3000/api/v1/matters

# Run tests (once you've added them)
cd backend && npm test

# Development mode with hot reload
docker compose -f docker-compose.dev.yml up
```

**Important Documents**:
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Complete database schema, field types, and query examples
- [QUICKSTART.md](./QUICKSTART.md) - Detailed setup guide and troubleshooting
- [README.md](./README.md) - Project overview and architecture

## Boilerplate Structure

```
matter-management-mvp/
├── DATABASE_SCHEMA.md                          ← READ THIS FIRST! (Schema docs)
├── backend/
│   ├── src/
│   │   ├── ticketing/matter/
│   │   │   ├── service/cycle_time_service.ts  ← IMPLEMENT CYCLE TIME & SLA
│   │   │   ├── repo/matter_repo.ts            ← ADD SORTING & SEARCH
│   │   │   └── __tests__/                     ← ADD TESTS HERE
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx                             ← ADD SEARCH BAR
│   │   └── components/MatterTable.tsx          ← ADD CYCLE TIME/SLA + SORT HANDLERS
│   └── package.json
├── database/
│   ├── schema.sql                              ← Reference for schema
│   └── seed.js                                 ← 10K matters seeded
└── README.md                                   ← UPDATE WITH YOUR APPROACH
```

## Questions?

If anything is unclear about the requirements:
1. Make reasonable assumptions
2. Document them in your README
3. Explain your reasoning

We're interested in seeing how you think through ambiguity.

## Tips for Success

1. **Read DATABASE_SCHEMA.md first** - Understand the EAV pattern and field types before coding
2. **Start with the backend** - Get cycle times working, then sorting, then search
3. **Test as you go** - Don't wait until the end
4. **Read the existing code** - Understand the patterns we use
5. **Focus on the critical path** - Cycle times → Sorting → Search → Tests → Scalability docs
6. **Document your thinking** - README matters as much as code
7. **Time management** - Don't over-engineer. Production-ready doesn't mean perfect.

## Good Luck! 🎉

We're excited to see your solution. Remember:
- **Quality over quantity**
- **Communication matters**
- **Scalability thinking is key**
- **You own the code you submit**

---

**Questions about the assessment?** Include them in your README submission and we'll discuss during the follow-up interview.

