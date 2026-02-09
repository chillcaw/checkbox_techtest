## The reality of performance

If we want this query read to be as performant as possible, we need to remove the strict pagination requirements.

## tsvector

Full-word lowercased search, we'd want to return full word matches first anyways

```sql
ALTER TABLE ticketing_ticket_field_value
ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
  to_tsvector(
    'simple',
    coalesce(text_value, '') || ' ' ||
    coalesce(string_value, '') || ' ' ||
    coalesce(number_value::text, '')
  )
) STORED;

CREATE INDEX ON ticketing_ticket_field_value
USING gin (search_vector);

-- Sample clause
WHERE search_vector @@ plainto_tsquery('simple', $1)
```

## GIN Trigram Indexes

Trigram are our fallback for fuzzy searching, partial matches, etc.

```sql
CREATE INDEX ON ttfv USING gin (lower(text_value) gin_trgm_ops);
CREATE INDEX ON ttfv USING gin (lower(string_value) gin_trgm_ops);

-- Sample clause
-- We have to use lower here to force the index
WHERE length($1) >= 3 AND lower(ttfv.text_value) ILIKE '%' || $1 || '%'
```

## The idea (Won't implement)

This would be a "Get best matches" style query, not a "Get page of matches" query.

This is not developer friendly at all, it's complex to maintain, and it's very hard to analyze performance wise.
But this is the general idea of how you'd implement a search that uses both methods. I was just curious how far I could push it with psuedo code.

If we weren't dealing with strict pagination requirements, we could just do a UNION of the two search methods and order by relevance.
Unfortunately we have to return exactly 50 results per page (in paginated order), sorted by created_at / updated_at / etc.

You can get this to work with pagination, but at this point it's getting very complex and you're probably looking for search optimized toolings (Elasticsearch, etc).
The reasons is gets complex is because you have to keep track of the limit offset between the two methods, and ensure you are returning the correct number of results per page in the right order with no duplicates.

You could also add a simple source_ranking, full word matches (source_ranking = 1) always come first, then trigram matches (source_ranking = 2). But in reality, using elasticsearch to rank by
weighting or "match score" (I forget what it's called) is probably a better idea.

## psuedo-code example

```sql
-- Get full text search results first
WITH fts_matches AS (
    SELECT
        tt.id,
        tt.created_at,
        tt.updated_at,
        -- ROW_NUMBER to avoid DISTINCT tt.id
        ROW_NUMBER() OVER (PARTITION BY tt.id ORDER BY tt.created_at DESC) AS rn
    FROM ticketing_ticket tt
    JOIN ticketing_ticket_field_value ttfv
        ON tt.id = ttfv.ticket_id
    JOIN ticketing_fields tf
        ON ttfv.ticket_field_id = tf.id
    LEFT JOIN ticketing_field_status_options tfso
        ON ttfv.status_reference_value_uuid = tfso.id
    WHERE tf.deleted_at IS NULL
      AND ttfv.search_vector @@ plainto_tsquery('simple', $1)
    LIMIT 50
),
-- Take only the first row per ticket
fts_top AS (
    SELECT *
    FROM fts_matches
    WHERE rn = 1
    ORDER BY ${sortedBy} ${sorted}
),
fts_count AS (
    SELECT COUNT(*) AS cnt FROM fts_top
),
-- Get trigram matches to fill up to 50 results
trgm_matches AS (
    SELECT
        tt.id,
        tt.created_at,
        tt.updated_at,
        ROW_NUMBER() OVER (PARTITION BY tt.id ORDER BY tt.created_at DESC) AS rn
    FROM ticketing_ticket tt
    JOIN ticketing_ticket_field_value ttfv
        ON tt.id = ttfv.ticket_id
    JOIN ticketing_fields tf
        ON ttfv.ticket_field_id = tf.id
    LEFT JOIN ticketing_field_status_options tfso
        ON ttfv.status_reference_value_uuid = tfso.id
    CROSS JOIN fts_count
    WHERE tf.deleted_at IS NULL
      AND length($1) >= 3
      AND (
          lower(ttfv.text_value) LIKE '%' || lower($1) || '%'
          OR lower(ttfv.string_value) LIKE '%' || lower($1) || '%'
          -- Would create an index on this if needed
          -- OR lower(ttfv.number_value_text) LIKE '%' || lower($1) || '%'
      )
      -- Exclude FTS tickets
      AND tt.id NOT IN (SELECT id FROM fts_top)
      LIMIT 50 - (SELECT cnt FROM fts_count)
),
trgm_top AS (
    SELECT *
    FROM trgm_matches
    WHERE rn = 1
    ORDER BY ${sortedBy} ${sorted}
),
top_ids AS (
    SELECT id FROM fts_top
    UNION ALL
    SELECT id FROM trgm_top
)
SELECT
    tt.id,
    tt.created_at,
    tt.updated_at,
    ttfv.ticket_field_id,
    ttfv.text_value,
    ttfv.string_value,
    ttfv.number_value,
    tf.label AS field_label,
    tfo.label AS option_label,
    tfso.label AS status_label
FROM ticketing_ticket tt
JOIN ticketing_ticket_field_value ttfv
    ON tt.id = ttfv.ticket_id
JOIN ticketing_fields tf
    ON ttfv.ticket_field_id = tf.id
LEFT JOIN ticketing_field_options tfo
    ON ttfv.select_reference_value_uuid = tfo.id
LEFT JOIN ticketing_field_status_options tfso
    ON ttfv.status_reference_value_uuid = tfso.id
JOIN top_ids p
    ON tt.id = p.id
ORDER BY tt.${sortedBy} ${sorted};
```

## Simpler version with pagination

The idea here, is we have to do the full count anyways, do limiting the CTE itself doesn't make much sense.

```sql
-- Written by hand
WITH ticket_id_duped AS (
    SELECT
        tt.id
        ,tt.created_at
        ,tt.updated_at
        -- Avoid distinct tt.id
        ,ROW_NUMBER() OVER (PARTITION BY tt.id ORDER BY tt.created_at DESC) AS rn
    FROM ticketing_ticket tt
    -- INNER JOIN might be faster here
    -- WHY? Tickets without fields, if it's possible
    -- This has important implications, because it'll prevent the searching of tickets without fields
    -- They will not show in the results at all
    INNER JOIN ticketing_ticket_field_value ttfv ON (tt.id = ttfv.ticket_id)
    LEFT JOIN ticketing_fields tf ON (ttfv.ticket_field_id = tf.id)
    LEFT JOIN ticketing_field_options tfo ON (ttfv.select_reference_value_uuid = tfo.id)
    LEFT JOIN ticketing_field_status_options tfso ON (ttfv.status_reference_value_uuid = tfso.id)
    WHERE
        tf.deleted_at IS NULL
        AND (
          -- We have to be really careful here, and make sure the correct indexes are being used
          -- Postgres won't always pick the right one with complex OR clauses
          -- 1. search_vector full text search
          -- 2. trigram indexes on all fields
          -- Will remove the search_vector part if postgres is struggling to figure out what index to use
          ttfv.search_vector @@ plainto_tsquery('simple', $${paramIndex})
          -- keep in mind that lower isn't actually being called here, it's just matching the index pattern defined
          -- no need for ILIKE because the indexes are lower cased, don't think it would matter in reality
          OR lower(ttfv.text_value) LIKE '%' || $${paramIndex} || '%'
          OR lower(ttfv.string_value) LIKE '%' || $${paramIndex} || '%'
          OR lower(ttfv.number_value_text) LIKE '%' || $${paramIndex} || '%'
          OR tfso.label = $${paramIndex}
        )
),
-- Deduplicate ticket ids, we are avoiding
tickets_ids AS (
    SELECT
      tid.id
      ,tid.created_at
      ,tid.updated_at
    FROM ticket_id_duped tid
    WHERE rn = 1
),
ticket_count AS (
    -- We can get an estimate here, but to match the spec I'm doing a full count
    -- In my experience estimates are usually way off and lead to bad UX
    SELECT COUNT(*) AS total FROM tickets_ids
),
SELECT
    -- Avoiding doing a seperate count query
    -- Definitely over head here, but keep in mind this isn't for the full dataset, just the page
    ticket_count.total AS total_records
    ,tt.id
    ,tt.created_at
    ,tt.updated_at
    ,ttfv.ticket_field_id AS _ticket_field_id,
    ,ttfv.text_value AS _text_value,
    ,ttfv.string_value AS _string_value,
    ,ttfv.number_value AS _number_value,
    ,tf.label AS _field_label,
    ,tfo.label AS _option_label,
    ,tfso.label AS _status_label
-- FROM deduplicated CTE results
FROM ticket_ids tt
-- INNER JOIN might be faster here
INNER JOIN ticketing_ticket_field_value ttfv ON tt.id = ttfv.ticket_id
LEFT JOIN ticketing_fields tf ON ttfv.ticket_field_id = tf.id
LEFT JOIN ticketing_field_options tfo ON ttfv.select_reference_value_uuid = tfo.id
LEFT JOIN ticketing_field_status_options tfso ON ttfv.status_reference_value_uuid = tfso.id
ORDER BY tt.${sortedBy} ${sorted}
LIMIT $${++paramIndex} OFFSET $${++paramIndex}
```

## Potentially severe issue with this query

With 4 types of indexes, postgres might not use the right indexes.
The main issue is that the postgres query planner is going to find it difficult to estimate the resultant set sizes of each index when using %% like clauses and
may resort to full scans.

```sql
ttfv.search_vector @@ plainto_tsquery('simple', $${paramIndex})
-- keep in mind that lower isn't actually being called here, it's just matching the index pattern defined
-- no need for ILIKE because the indexes are lower cased, don't think it would matter in reality
OR lower(ttfv.text_value) LIKE '%' || $${paramIndex} || '%'
OR lower(ttfv.string_value) LIKE '%' || $${paramIndex} || '%'
OR lower(ttfv.number_value_text) LIKE '%' || $${paramIndex} || '%'
```

A solution would be to remove the full text search and combine all pg_trgm indexes into one. Keep in mind, this doesn't prevent you from having indexes on individual columns as well.

```sql
CREATE INDEX ttfv_trgm_all_fields
ON ticketing_ticket_field_value
USING gin ((text_value || ' ' || string_value || ' ' || number_value_text) gin_trgm_ops);

-- Keep in mind that lower isn't actually being called here, it's just matching the index pattern defined
lower(ttfv.text_value || ' ' || ttfv.string_value || ' ' || ttfv.number_value_text) LIKE '%' || $1 || '%'
```

This will force postgres to use a single index for all trigram searches, but it comes at the cost of index size and write performance.

You can avoid doing this with multiple CTEs for each index, but it becomes extremely difficult to maintain page limits and offsets.

## Calculating the count faster

If you want to get a faster count, you can use the `reltuples` from `pg_class` as an estimate. (not a fan of this personally, but it's an option)
Calclate once per different lowercases search term and cache for a short period of time.

The caching strategy depends on what queries are being run, e.g: if employee "John" is searching "Sarah" 10000 times a day, we probably wanna cache the count if postgres isn't already.

Avoiding count all together: just use a cursor based pagination strategy (not what the spec wants though). We probably want to avoid multiple page fetches at once anyways.
This also optimises OFFSET queries because we can now do them with where clauses using last_seen

## Making this simpler

We could just add a "search_value" column that holds a stringified lowercased version of the real searchable value.

This removes the need to concatenated indexes, and allows us to create a single GIN trigram index on that column.
We could get away with not needing to use lower(column) in the search clause as well.

## Materialized Views (bad idea for this use case)

Not the magic bullet, they require refreshes, often full refreshes, and can be slow to refresh depending on the dataset size.
We actually want to refresh single rows as they are created / updated, which is not what materialized views are designed for.

## Incremental updates to a search_value column

```sql
-- Trigger pseudo code written by hand
ALTER TABLE ticketing_ticket_field_value
ADD COLUMN search_value TEXT;

CREATE INDEX ON ticketing_ticket_field_value
USING gin (search_value gin_trgm_ops);

CREATE OR REPLACE FUNCTION update_search_value()
RETURNS TRIGGER AS $$
DECLARE
    var_field_type TEXT;
BEGIN
    SELECT tf.field_type INTO var_field_type
    FROM ticketing_fields tf
    WHERE tf.id = NEW.ticket_field_id

    IF var_field_type = 'text' THEN
        NEW.search_value := lower(coalesce(NEW.text_value, ''));
    ELSE IF var_field_type = 'string' THEN
        NEW.search_value := lower(coalesce(NEW.string_value, ''));
    ELSE IF var_field_type = 'number' THEN
        NEW.search_value := lower(coalesce(NEW.number_value::TEXT, ''));
    ELSE IF var_field_type = 'status' THEN
        NEW.search_value := lower(coalesce(
            (SELECT tfso.label
             FROM ticketing_field_status_options tfso
             WHERE tfso.id = NEW.status_reference_value_uuid),
            ''
        ));
    ELSE IF var_field_type = 'select' THEN
        NEW.search_value := lower(coalesce(
            (SELECT tfo.label
             FROM ticketing_field_options tfo
             WHERE tfo.id = NEW.select_reference_value_uuid),
            ''
        ));
    ELSE IF var_field_type = 'user' THEN
        -- will create proper join to get use name
        NEW.search_value := lower(coalesce(
          SELECT u.first_name || ' ' || u.last_name
          FROM users u
          WHERE u.id = NEW.user_value
          , ''));
    -- We could support fields like full date string, so they can search "January" if we wanted to
    ELSE
        NEW.search_value := '';
    END IF;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_search_value
BEFORE INSERT OR UPDATE ON ticketing_ticket_field_values
FOR EACH
ROW EXECUTE FUNCTION update_search_value();
```

We can take this idea even further by creating a table that aggregates all searchable values per ticket into a single row. This removes the need for distinct queries at the top level.
I'm not going to implement this because it's getting out of scope, but the general idea is to have a table like:

```sql
CREATE TABLE ticketing_ticket_search (
    ticket_id UUID PRIMARY KEY REFERENCES ticketing_ticket(id),
    search_value TEXT
);

-- Were search_value is a concatenation of all searchable field values for that ticket and indexed with a GIN trigram index.
```
