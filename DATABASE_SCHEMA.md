# Database Schema Documentation

## Overview

This Matter Management system uses PostgreSQL with an **Entity-Attribute-Value (EAV)** pattern to support flexible field types. This allows us to store different types of data (text, numbers, dates, etc.) in a unified structure.

---

## 📊 Quick Stats

- **Tables**: 11 core tables
- **Field Types**: 8 different types
- **Status Groups**: 3 (To Do, In Progress, Done)
- **Seeded Data**: 10,000 matters with realistic data

---

## 🗂️ Core Tables

### 1. `accounts`
Represents client accounts or organizations.

| Column | Type | Description |
|--------|------|-------------|
| `account_id` | SERIAL | Primary key |
| `account_name` | VARCHAR(255) | Organization name |
| `created_at` | TIMESTAMP | Record creation time |

**Sample Data**: 1 account (default for MVP)

---

### 2. `users`
Users who work on matters.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `account_id` | INTEGER | Foreign key to accounts |
| `email` | VARCHAR(255) | Unique email address |
| `first_name` | VARCHAR(100) | User's first name |
| `last_name` | VARCHAR(100) | User's last name |
| `created_at` | TIMESTAMP | Record creation time |

**Sample Data**: 5 users (Alice Brown, Jane Smith, Bob Johnson, Carol White, David Lee)

---

### 3. `ticketing_board`
Boards organize matters (like projects or workspaces).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `account_id` | INTEGER | Foreign key to accounts |
| `name` | VARCHAR(255) | Board name |
| `created_at` | TIMESTAMP | Record creation time |

**Sample Data**: 1 board ("Legal Matters Board")

---

### 4. `ticketing_ticket`
The core **matter/ticket** entity.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (unique matter ID) |
| `board_id` | UUID | Foreign key to ticketing_board |
| `platform_type` | VARCHAR(50) | Source platform (default: 'web') |
| `created_at` | TIMESTAMP | Matter creation time |
| `updated_at` | TIMESTAMP | Last update time |

**Sample Data**: 10,000 matters

**Important**: This table only stores matter metadata. All field values are stored in `ticketing_ticket_field_value` (EAV pattern).

---

### 5. `ticketing_fields`
Defines what fields are available (field definitions).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `account_id` | INTEGER | Foreign key to accounts |
| `name` | VARCHAR(255) | Field name (e.g., "Subject", "Due Date") |
| `field_type` | VARCHAR(50) | Field type (see types below) |
| `description` | TEXT | Field description |
| `metadata` | JSONB | Additional configuration |
| `system_field` | BOOLEAN | Is this a system field? |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time |

**Field Types** (8 types):
1. `text` - Long text (multi-line)
2. `number` - Numeric values
3. `select` - Dropdown with predefined options
4. `date` - Date/time values
5. `currency` - Monetary amounts with currency
6. `boolean` - Yes/No (true/false)
7. `status` - Matter status (linked to status groups)
8. `user` - Reference to a user

**Sample Data**: 9 fields defined
- Subject (text)
- Description (text)
- Case Number (number)
- Priority (select)
- Due Date (date)
- Contract Value (currency)
- Urgent (boolean)
- Status (status)
- Assigned To (user)

---

### 6. `ticketing_ticket_field_value`
**The EAV table** - stores actual field values for each matter.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `ticket_id` | UUID | Foreign key to ticketing_ticket |
| `ticket_field_id` | UUID | Foreign key to ticketing_fields |
| `created_by` | INTEGER | User who created this value |
| `updated_by` | INTEGER | User who last updated |
| `created_at` | TIMESTAMP | Value creation time |
| `updated_at` | TIMESTAMP | Last update time |
| **Value Columns** | | |
| `text_value` | TEXT | For 'text' field type |
| `string_value` | VARCHAR(255) | For short text |
| `number_value` | NUMERIC | For 'number' field type |
| `date_value` | TIMESTAMP | For 'date' field type |
| `user_value` | INTEGER | For 'user' field type (FK to users) |
| `boolean_value` | BOOLEAN | For 'boolean' field type |
| `currency_value` | JSONB | For 'currency' field type `{amount, currency}` |
| `select_reference_value_uuid` | UUID | For 'select' field type (FK to options) |
| `status_reference_value_uuid` | UUID | For 'status' field type (FK to status options) |

**How EAV Works**:
```sql
-- Example: Getting the "Subject" field value for a matter
SELECT 
  tf.name as field_name,
  ttfv.string_value as value
FROM ticketing_ticket_field_value ttfv
JOIN ticketing_fields tf ON ttfv.ticket_field_id = tf.id
WHERE ttfv.ticket_id = '<matter-id>'
  AND tf.name = 'subject';
```

**Important**: 
- Each matter has ~9 rows in this table (one per field)
- Only the appropriate `*_value` column is populated based on `field_type`
- Unique constraint on `(ticket_id, ticket_field_id)` - one value per field per matter

---

### 7. `ticketing_field_status_groups`
Status workflow groups (To Do → In Progress → Done).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `account_id` | INTEGER | Foreign key to accounts |
| `name` | VARCHAR(255) | Group name ("To Do", "In Progress", "Done") |
| `sequence` | INTEGER | Display order |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time |

**Sample Data**: 3 status groups
1. To Do (sequence: 1)
2. In Progress (sequence: 2)
3. Done (sequence: 3)

---

### 8. `ticketing_field_status_options`
Individual status options within each group.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `ticket_field_id` | UUID | Foreign key to ticketing_fields |
| `group_id` | UUID | Foreign key to status groups |
| `label` | VARCHAR(255) | Status label ("Backlog", "Active", etc.) |
| `sequence` | INTEGER | Display order within group |
| `metadata` | JSONB | Additional configuration |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time |

**Sample Data**: Multiple status options mapped to groups
- To Do group: "Backlog", "Ready"
- In Progress group: "Active", "Under Review"
- Done group: "Completed", "Closed"

---

### 9. `ticketing_field_options`
Options for 'select' field types (dropdown choices).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `ticket_field_id` | UUID | Foreign key to ticketing_fields |
| `label` | VARCHAR(255) | Option label ("High", "Medium", "Low") |
| `sequence` | INTEGER | Display order |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time |

**Sample Data**: Priority field options
- High (sequence: 1)
- Medium (sequence: 2)
- Low (sequence: 3)

---

### 10. `ticketing_currency_field_options`
Available currencies for currency fields.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `account_id` | INTEGER | Foreign key to accounts |
| `code` | VARCHAR(8) | Currency code ("USD", "GBP", "EUR") |
| `name` | VARCHAR(64) | Full name ("US Dollar") |
| `symbol` | VARCHAR(8) | Symbol ("$", "£", "€") |
| `sequence` | INTEGER | Display order |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time |

**Sample Data**: 3 currencies
- USD (US Dollar, $)
- GBP (British Pound, £)
- EUR (Euro, €)

---

### 11. `ticketing_cycle_time_histories`
**Tracks status transitions** for cycle time calculation.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `ticket_id` | UUID | Foreign key to ticketing_ticket |
| `status_field_id` | UUID | Foreign key to ticketing_fields |
| `from_status_id` | UUID | Previous status (NULL for first transition) |
| `to_status_id` | UUID | New status (FK to status options) |
| `transitioned_at` | TIMESTAMP | When the transition occurred |
| `created_at` | TIMESTAMP | Record creation time |

**Sample Data**: Every matter has multiple transitions

**Example Workflow**:
```
Matter #1:
  NULL → "Backlog" (To Do group) at 2025-10-20 10:00
  "Backlog" → "Active" (In Progress group) at 2025-10-20 14:30
  "Active" → "Completed" (Done group) at 2025-10-21 09:15
```

**Use for Cycle Time**:
- Resolution time = Time from first transition to "Done" group
- SLA calculation = Compare resolution time vs threshold (8 hours)

---

## 🔍 Database Indexes

Performance indexes are pre-configured:

### Primary Indexes
```sql
-- Matter lookups
idx_ticketing_ticket_board_id
idx_ticket_field_value_ticket_id

-- Field value queries
idx_ticket_field_value_field_id
idx_ticket_field_value_status_ref

-- Cycle time queries
idx_cycle_time_histories_ticket_id
idx_cycle_time_histories_to_status
```

### Search Indexes (pg_trgm)
```sql
-- Full-text search support
idx_ticket_field_value_text_trgm (GIN)
idx_ticket_field_value_string_trgm (GIN)
```

### Sorting Indexes
```sql
-- For efficient sorting
idx_ticket_field_value_number
idx_ticket_field_value_date
idx_ticketing_ticket_created_at
```

---

## 📝 Common Query Patterns

### Get a Matter with All Fields

```sql
SELECT 
  tt.id as matter_id,
  tt.created_at,
  tf.name as field_name,
  tf.field_type,
  ttfv.string_value,
  ttfv.number_value,
  ttfv.date_value,
  ttfv.boolean_value,
  -- ... other value columns
FROM ticketing_ticket tt
LEFT JOIN ticketing_ticket_field_value ttfv ON tt.id = ttfv.ticket_id
LEFT JOIN ticketing_fields tf ON ttfv.ticket_field_id = tf.id
WHERE tt.id = '<matter-uuid>';
```

### Get Matter Status

```sql
SELECT 
  tt.id,
  tfsg.name as status_group,
  tfso.label as status_label
FROM ticketing_ticket tt
JOIN ticketing_ticket_field_value ttfv ON tt.id = ttfv.ticket_id
JOIN ticketing_fields tf ON ttfv.ticket_field_id = tf.id
JOIN ticketing_field_status_options tfso ON ttfv.status_reference_value_uuid = tfso.id
JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
WHERE tf.field_type = 'status';
```

### Get Cycle Time History

```sql
SELECT 
  tcth.transitioned_at,
  tfsg.name as status_group,
  tfso.label as status_label
FROM ticketing_cycle_time_histories tcth
JOIN ticketing_field_status_options tfso ON tcth.to_status_id = tfso.id
JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
WHERE tcth.ticket_id = '<matter-uuid>'
ORDER BY tcth.transitioned_at ASC;
```

### Search Across Text Fields

```sql
SELECT DISTINCT tt.id
FROM ticketing_ticket tt
JOIN ticketing_ticket_field_value ttfv ON tt.id = ttfv.ticket_id
WHERE ttfv.string_value ILIKE '%search term%'
   OR ttfv.text_value ILIKE '%search term%';
```

---

## 🎯 Assessment Task: Sorting Implementation

### Current State
- ✅ Frontend has sort UI on "Subject" column only
- ✅ Backend only supports sorting by `created_at` and `updated_at`
- ❌ Other columns (Case Number, Status, Priority, etc.) are **not sortable**

### What You Need to Implement

**Backend** (`backend/src/ticketing/matter/repo/matter_repo.ts`):

Extend the `orderByClause` logic to support sorting by field values:

```typescript
// Currently only supports:
if (sortBy === 'created_at') {
  orderByClause = `tt.created_at ${sortOrder.toUpperCase()}`;
} else if (sortBy === 'updated_at') {
  orderByClause = `tt.updated_at ${sortOrder.toUpperCase()}`;
}

// You need to add field-based sorting:
// - Sort by number fields (Case Number)
// - Sort by text fields (Subject, Priority label)
// - Sort by date fields (Due Date)
// - Sort by status (by group sequence or label)
// - Handle NULL values appropriately
```

**Challenges**:
1. **EAV Pattern**: Field values are in a separate table
2. **Join Strategy**: Need to join with field value table
3. **Performance**: Avoid N+1 queries
4. **Field Types**: Different value columns for different types
5. **NULL Handling**: Not all matters have all fields

**Suggested Approach**:
```sql
-- Example: Sort by Case Number (number field)
SELECT DISTINCT tt.id, tt.created_at, ttfv_sort.number_value
FROM ticketing_ticket tt
LEFT JOIN ticketing_ticket_field_value ttfv_sort 
  ON tt.id = ttfv_sort.ticket_id
  AND ttfv_sort.ticket_field_id = '<case-number-field-id>'
ORDER BY ttfv_sort.number_value ASC NULLS LAST;
```

**Frontend** (`frontend/src/components/MatterTable.tsx`):

Add sort click handlers to all column headers:
- Case Number
- Status
- Priority
- Assigned To
- Contract Value
- Urgent
- Due Date
- Resolution Time (after implementing cycle time)
- SLA (after implementing SLA)

**Performance Considerations**:
- Use the existing indexes (`idx_ticket_field_value_number`, `idx_ticket_field_value_date`)
- Consider adding field-specific indexes if sorting is slow
- For 10× load, consider materialized views or denormalization

---

## 🔧 Database Extensions

### pg_trgm (Trigram)
Used for fuzzy text search and ILIKE performance.

```sql
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enables fast text search
SELECT * FROM ticketing_ticket_field_value 
WHERE string_value ILIKE '%contract%';
```

### uuid-ossp
Used for generating UUIDs.

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Generates UUID v4
INSERT INTO ticketing_ticket (id, board_id)
VALUES (uuid_generate_v4(), '<board-id>');
```

---

## 📈 Scalability Considerations

### Current Performance
- ✅ Indexes for common queries
- ✅ Connection pooling
- ✅ Efficient single-matter queries
- ❌ List queries could be optimized for 100,000+ matters

### For 10× Load (100,000 matters)

**Database Level**:
1. **Partitioning**: Partition `ticketing_ticket` by date or board
2. **Materialized Views**: Pre-compute common queries
3. **Read Replicas**: Separate read/write databases
4. **Query Optimization**: Use EXPLAIN ANALYZE to find bottlenecks

**Application Level**:
1. **Caching**: Redis for frequently accessed matters
2. **Pagination**: Keep page size reasonable (25-100)
3. **Field Indexing**: Add indexes on frequently sorted/filtered fields
4. **Denormalization**: Consider storing frequently accessed field values in `ticketing_ticket`

**Search at Scale**:
1. **Elasticsearch**: For advanced full-text search
2. **Debouncing**: Already implemented (500ms)
3. **Search Indexes**: Use GIN indexes on all text columns

---

## 🧪 Sample Queries for Testing

### Count Matters by Status Group
```sql
SELECT tfsg.name, COUNT(*) as count
FROM ticketing_ticket tt
JOIN ticketing_ticket_field_value ttfv ON tt.id = ttfv.ticket_id
JOIN ticketing_field_status_options tfso ON ttfv.status_reference_value_uuid = tfso.id
JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
GROUP BY tfsg.name;
```

### Average Resolution Time
```sql
SELECT AVG(
  EXTRACT(EPOCH FROM (done.transitioned_at - first.transitioned_at))
) / 3600 as avg_hours
FROM (
  SELECT ticket_id, MIN(transitioned_at) as transitioned_at
  FROM ticketing_cycle_time_histories
  GROUP BY ticket_id
) first
JOIN (
  SELECT ticket_id, transitioned_at
  FROM ticketing_cycle_time_histories tcth
  JOIN ticketing_field_status_options tfso ON tcth.to_status_id = tfso.id
  JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
  WHERE tfsg.name = 'Done'
) done ON first.ticket_id = done.ticket_id;
```

### Find Matters with No Status Transitions
```sql
SELECT tt.id
FROM ticketing_ticket tt
LEFT JOIN ticketing_cycle_time_histories tcth ON tt.id = tcth.ticket_id
WHERE tcth.id IS NULL;
```

---

## 📚 Additional Resources

- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **EAV Pattern**: https://en.wikipedia.org/wiki/Entity%E2%80%93attribute%E2%80%93value_model
- **pg_trgm**: https://www.postgresql.org/docs/current/pgtrgm.html
- **Query Optimization**: Use `EXPLAIN ANALYZE` to understand query performance

---

## 🎯 Quick Reference

**Total Tables**: 11
**Total Matters**: 10,000
**Field Types**: 8
**Status Groups**: 3

**Key Tables**:
- `ticketing_ticket` - Matters
- `ticketing_ticket_field_value` - Field values (EAV)
- `ticketing_fields` - Field definitions
- `ticketing_cycle_time_histories` - Status transitions

**Assessment Focus**:
1. Cycle time calculation (query `ticketing_cycle_time_histories`)
2. Search implementation (use pg_trgm indexes)
3. **Sorting implementation (join with field values)**
4. Testing (edge cases, NULL handling)

