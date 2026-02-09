SELECT * FROM pg_catalog.pg_tables;

------------------------------
-- SORTING PLAYGROUND
------------------------------

-- Get field ID OR: NULL -> give feedback to user saying the field doesn't exist
SELECT 
    tf.id
    -- Fetching for debugging purposes
    , tf.name
FROM ticketing_fields tf
WHERE name ILIKE 'Subject';

SELECT
  tf.id
  , tf.name
  , tf.field_type
FROM ticketing_fields tf
WHERE tf.name ILIKE 'STATUS';

-- Sorting experimentation with sorted CTE
WITH sorted_tickets AS (
    SELECT
        tt.id
        , tt.created_at
        , tt.updated_at

        , tf.field_type AS field_type
        , tf.name AS field_name

        , ttfv_sort.number_value AS field_number_value
        , ttfv_sort.string_value AS field_string_value
        , ttfv_sort.text_value AS field_text_value

        , tfso.label AS field_status_option_label
        , tfo.label AS field_select_option_label
    FROM 
        ticketing_ticket AS tt
    LEFT JOIN ticketing_ticket_field_value AS ttfv_sort ON (tt.id = ttfv_sort.ticket_id AND ttfv_sort.ticket_field_id = '942bffd5-754f-49c3-9840-d62532ea1490')
    LEFT JOIN ticketing_fields AS tf ON (ttfv_sort.ticket_field_id = tf.id)
    LEFT JOIN ticketing_field_options AS tfo ON (ttfv_sort.select_reference_value_uuid = tfo.id)
    LEFT JOIN ticketing_field_status_options AS tfso ON (ttfv_sort.status_reference_value_uuid = tfso.id)
    LEFT JOIN users u ON (ttfv_sort.user_value = u.id)
    WHERE 
        tf.deleted_at IS NULL
    ORDER BY 
        tfo.sequence DESC NULLS LAST
)
SELECT
    *
FROM sorted_tickets tt
LEFT JOIN ticketing_ticket_field_value AS ttfv_sort ON (tt.id = ttfv_sort.ticket_id)
LEFT JOIN ticketing_fields AS tf ON (ttfv_sort.ticket_field_id = tf.id)
LEFT JOIN ticketing_field_options AS tfo ON (ttfv_sort.select_reference_value_uuid = tfo.id)
LEFT JOIN ticketing_field_status_options AS tfso ON (ttfv_sort.status_reference_value_uuid = tfso.id)
LEFT JOIN users u ON (ttfv_sort.user_value = u.id);

    
------------------------------
-- SLA PLAYGROUND
------------------------------
SELECT
    tt.id
FROM
   ticketing_ticket tt
LEFT JOIN ticketing_cycle_time_histories AS tcth ON (tt.id = tcth.ticket_id)
LEFT JOIN ticketing_field_status_options AS tfso ON (tcth.to_status_id = tfso.id)

WHERE
    tcth.

GROUP BY
    tt.id
ORDER BY
    tt.id ASC;

CREATE OR REPLACE FUNCTION format_duration(seconds bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
SELECT
  CASE
    -- If less than a minute, just return seconds
    WHEN seconds < 60 THEN
      seconds || 's'

    -- If less than an hour the format will omit hours and days
    WHEN seconds < 3600 THEN
      (seconds / 60) || 'm ' ||
      (seconds % 60) || 's'

    -- If less than a day the format will omit seconds and days
    WHEN seconds < 86400 THEN
      (seconds / 3600) || 'h ' ||
      ((seconds % 3600) / 60) || 'm'

    -- If there are days present, format will omit minutes and seconds
    ELSE
      (seconds / 86400) || 'd ' ||
      ((seconds % 86400) / 3600) || 'h'
  END;
$$;

-- Get formatted progress time and SLA status
-- Unfortunately the data set contains no tickets that have in progress
-- Note you can do this without a double table scan in the first CTE by using MIN and MAX
-- Figuring out whether thats faster is complex and depends on lots of things
-- I will just use the sample query from the docs, since the checkbox guys are the subject matter experts here
CREATE OR REPLACE VIEW enriched_ticketing_sla AS
WITH sla_calculations AS (
    SELECT
        first.ticket_id AS ticket_id
        , first.transitioned_at AS first_transitioned_at
        , done.transitioned_at AS done_transitioned_at
        , CASE 
          WHEN done.transitioned_at IS NOT NULL THEN done.transitioned_at - first.transitioned_at
          ELSE NOW() - first.transitioned_at
        END AS total_time
    FROM (
      SELECT ticket_id, MIN(transitioned_at) as transitioned_at
      FROM ticketing_cycle_time_histories
      GROUP BY ticket_id
    ) first
    LEFT JOIN (
      -- We'll let tasks with no Done status record through
      SELECT ticket_id, transitioned_at
      FROM ticketing_cycle_time_histories tcth
      JOIN ticketing_field_status_options tfso ON tcth.to_status_id = tfso.id
      JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
      WHERE tfsg.name = 'Done'
    ) done ON first.ticket_id = done.ticket_id
)
SELECT
    sc.ticket_id
    , format_duration(EXTRACT(EPOCH FROM (sc.total_time))::bigint) AS total_time_formatted
    , CASE 
      -- Doesn't matter if in progress or done 8+ hours is a breach
      WHEN total_time > INTERVAL '8 hours' THEN 'Breached'
      WHEN done_transitioned_at IS NULL AND total_time <= INTERVAL '8 hours' THEN 'In Progress'
      ELSE 'Met'
    END AS sla_status
FROM sla_calculations AS sc;

SELECT * FROM enriched_ticketing_sla;

------------------------------
-- ALL TOGETHER PLAYGROUND
------------------------------
-- Remember CTEs aren't materialized unless the planner thinks its a good idea, usually in the case of LIMITs etc
-- Sort step needs to be done seperately, if there are two fields of the same time we want to distinguish between them
EXPLAIN (ANALYSE, VERBOSE, BUFFERS, FORMAT YAML)
WITH search_tickets AS (
    SELECT
        DISTINCT tt.id
        , tt.created_at
        , tt.updated_at
    FROM ticketing_ticket tt
    LEFT JOIN ticketing_ticket_field_value AS ttfv ON (tt.id = ttfv.ticket_id)
    LEFT JOIN ticketing_fields AS tf ON (ttfv.ticket_field_id = tf.id)
    LEFT JOIN ticketing_field_options AS tfo ON (ttfv.select_reference_value_uuid = tfo.id)
    LEFT JOIN ticketing_field_status_options AS tfso ON (ttfv.status_reference_value_uuid = tfso.id)
    LEFT JOIN users u ON (ttfv.user_value = u.id)
    WHERE 
        tf.deleted_at IS NULL
        AND (
            -- It's using bitmapOr containing both indexes, good.
            -- In the explain if you don't read carefully this will come through as "Bitmap Heap Scan" which can misleading
            -- ttfv.search_value ILIKE '%Contract%'
            -- OR ttfv.number_value::TEXT ILIKE '%' || 'Contract' || '%'
            ttfv.string_value ILIKE '%Contract%'
            OR ttfv.text_value ILIKE '%Contract%'
            -- -- We need a single searchable field, the second I add any more fields to search postgres doesn't actually use the indexes
            -- -- I'm not going to implement this, I asked the question and haven't heard back so I'm going to assume this is out of scope
            -- -- If we don't have a single searchable field, postgres is going to seq scan 90,000 records.
            -- -- RULE OF THUMB: Just because an index exists, doesn't mean postgres will use it, and with large or where clauses it rarely will
            OR u.first_name ILIKE '%Contract%'
            OR tfso.label ILIKE '%Contract%'
            OR tfo.label ILIKE '%Contract%'
        )
), 
sort_tickets AS (
    SELECT
        tt.id
        , tt.created_at
        , tt.updated_at

        , tf.field_type AS field_type
        , tf.name AS field_name

        , ttfv_sort.number_value AS field_number_value
        , ttfv_sort.string_value AS field_string_value
        , ttfv_sort.text_value AS field_text_value

        , tfso.label AS field_status_option_label
        , tfo.label AS field_select_option_label
    FROM 
        search_tickets AS tt
    LEFT JOIN ticketing_ticket_field_value AS ttfv_sort ON (tt.id = ttfv_sort.ticket_id AND ttfv_sort.ticket_field_id = '942bffd5-754f-49c3-9840-d62532ea1490')
    LEFT JOIN ticketing_fields AS tf ON (ttfv_sort.ticket_field_id = tf.id)
    LEFT JOIN ticketing_field_options AS tfo ON (ttfv_sort.select_reference_value_uuid = tfo.id)
    LEFT JOIN ticketing_field_status_options AS tfso ON (ttfv_sort.status_reference_value_uuid = tfso.id)
    LEFT JOIN users u ON (ttfv_sort.user_value = u.id)
    ORDER BY 
        -- Will be programmatically calculated in the app
        ttfv_sort.number_value ASC NULLS LAST, tt.created_at DESC
), 
limit_tickets AS (
    SELECT
        *
    FROM 
        sort_tickets
    LIMIT 10 OFFSET 0
)
SELECT 
    tt.id AS id
    , ets.total_time_formatted AS sla_total_time
    , ets.sla_status AS sla_status

    , tf.field_type AS field_type
    , tf.name AS field_name

    , ttfv.number_value AS field_number_value
    , ttfv.string_value AS field_string_value
    , ttfv.text_value AS field_text_value

    , tfso.label AS field_status_option_label
    , tfo.label AS field_select_option_label

    , u.first_name AS user_first_name
    , u.last_name AS user_last_name
FROM limit_tickets AS tt
LEFT JOIN enriched_ticketing_sla AS ets ON (tt.id = ets.ticket_id)
LEFT JOIN ticketing_ticket_field_value AS ttfv ON (tt.id = ttfv.ticket_id)
LEFT JOIN ticketing_fields AS tf ON (ttfv.ticket_field_id = tf.id)
LEFT JOIN ticketing_field_options AS tfo ON (ttfv.select_reference_value_uuid = tfo.id)
LEFT JOIN ticketing_field_status_options AS tfso ON (ttfv.status_reference_value_uuid = tfso.id)
LEFT JOIN users u ON (ttfv.user_value = u.id);

SELECT * FROM ticketing_ticket_field_value LIMIT 10;

-- TABLE CHANGES FOR SINGLE SEARCHABLE INDEX
ALTER TABLE ticketing_ticket_field_value ADD COLUMN search_value TEXT;
CREATE INDEX idx_ticketing_ticket_field_value_search_value ON ticketing_ticket_field_value USING gin (search_value gin_trgm_ops);
DROP INDEX idx_ticketing_ticket_field_value_search_value;

SELECT 
    tf.field_type
    , tf.name
    , ttfv.search_value
FROM ticketing_ticket_field_value AS ttfv
INNER JOIN ticketing_fields AS tf ON (ttfv.ticket_field_id = tf.id)
WHERE ttfv.search_value IS NOT NULL;

SELECT * FROM ticketing_fields;

-- SEARCH FIELD TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION update_search_value()
RETURNS TRIGGER AS $$
DECLARE
    var_field_type TEXT;
BEGIN
    SELECT tf.field_type INTO var_field_type
    FROM ticketing_fields tf
    WHERE tf.id = NEW.ticket_field_id;

    IF var_field_type = 'text' THEN
        -- We are making all the index values lowercase to make the index smaller (more collisions yay). "samantha" and "SAMANTHA" will be indexed the same way.
        -- Only pitfall here, is we are going to want to make values lowercase in js before searching them
        NEW.search_value := lower(coalesce(NEW.text_value, ''));
    ELSIF var_field_type = 'string' THEN
        NEW.search_value := lower(coalesce(NEW.string_value, ''));
    ELSIF var_field_type = 'number' THEN
        NEW.search_value := lower(coalesce(NEW.number_value::TEXT, ''));
    ELSIF var_field_type = 'status' THEN
        NEW.search_value := lower(coalesce(
            (SELECT tfso.label
             FROM ticketing_field_status_options tfso
             WHERE tfso.id = NEW.status_reference_value_uuid),
            ''
        ));
    ELSIF var_field_type = 'select' THEN
        NEW.search_value := lower(coalesce(
            (SELECT tfo.label
             FROM ticketing_field_options tfo
             WHERE tfo.id = NEW.select_reference_value_uuid),
            ''
        ));
    ELSIF var_field_type = 'user' THEN
        -- will create proper join to get use name
        NEW.search_value := lower(coalesce(
          (SELECT u.first_name || ' ' || u.last_name
           FROM users u
           WHERE u.id = NEW.user_value),
          ''));
    ELSE
        -- We can support other fields in future, e.g: Full human readable dates and searches like "january"
        -- ... currency we can just concat the ammount and the currency type, etc.
        -- We can do lots of things now, with the overhead of a larger search_value index.
        NEW.search_value := NULL;
    END IF;

    RETURN NEW;
END
$$ LANGUAGE plpgsql

CREATE TRIGGER trg_update_search_value
BEFORE INSERT OR UPDATE ON ticketing_ticket_field_value
FOR EACH
ROW EXECUTE FUNCTION update_search_value();

-- Forcing the trigger to run for all records
UPDATE ticketing_ticket_field_value
SET id=id;

-- ANALYSIS
-- I knew this would be an issue before I even started implementing the tech test requirements, but I wanted to prove it with real queries.

-- Using a single search_value does indeed force postgres to use the index.
-- I won't use load testing tools, but from repeated runs we just cut query time in half from ~200ms to ~100ms (on my machine)
-- Keep in mind, this is a bloody impressive performance gain for such a small dataset (90,000), with larger datasets the performance difference will be even more significant

-- As a disclaimer, the gin indexes provided in the tech test are fine. But with the requirement of searching user firstnames and option labels
-- ... the postgres query planner won't use the indexes when planning the query, and instead opts for a sequential scan. 

-- In my experience, you can generally have 2-3 OR statements before postgres gives up on using indexes, but this is something that should be tested and monitored in production with real world data and queries.
-- When using just the indexes provided in the tech test with no additional user firstname or option label checks, the query planner does use BitmapOr with both indexes in mind 
-- ...which is great, but as soon as you add any additional OR statements it goes out the window.

-- FIXING THE SLA TABLE SCAN
-- We can pre-aggregate the start and end time (or null) for each ticket, each time a ticket history is updated.
-- Even with the search_value index improvement, our query still scans 20,000+ records when running the SLA view query.
-- Usually I would create a seperate table with search_value and sla calculations, and we'd join to it when we need enriched values, but to keep things simple
-- ... I'm just going to create fields on the ticketing_ticket_field_value table and populate them with triggers, similar to the search_value implementation.
-- The formatted SLA time and the SLA status will both have to be calculated on the fly still, but the start and end time can be pre-aggregated
-- We aren't avoiding the table scan entirely, we're just doing it on write rather than during an already heavy read.

ALTER TABLE ticketing_ticket ADD COLUMN sla_first_transitioned_at TIMESTAMPTZ;
ALTER TABLE ticketing_ticket ADD COLUMN sla_done_transitioned_at TIMESTAMPTZ;

SELECT * FROM ticketing_ticket;

CREATE OR REPLACE FUNCTION update_sla_times()
RETURNS TRIGGER AS $$
DECLARE
    first_transitioned_at TIMESTAMPTZ;
    done_transitioned_at TIMESTAMPTZ;
BEGIN
    -- Out of scope: I'm going to assume for this task that done can be transitioned to once,
    -- For time sake, I'm going to ignore the possibility that a task can go from in progress to done multiple times.
    -- Main reason I'm ignoring this, is because the suggusted query to use in the spec also ignores this.
    SELECT MIN(tcth.transitioned_at) INTO first_transitioned_at
    FROM ticketing_cycle_time_histories AS tcth
    WHERE tcth.ticket_id = NEW.ticket_id;

    SELECT tcth.transitioned_at INTO done_transitioned_at
    FROM ticketing_cycle_time_histories AS tcth
    JOIN ticketing_field_status_options AS tfso ON tcth.to_status_id = tfso.id
    JOIN ticketing_field_status_groups AS tfsg ON tfso.group_id = tfsg.id
    WHERE tcth.ticket_id = NEW.ticket_id AND tfsg.name = 'Done';

    UPDATE ticketing_ticket
    SET sla_first_transitioned_at = first_transitioned_at,
        sla_done_transitioned_at = done_transitioned_at
    WHERE id = NEW.ticket_id;

    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_sla_times
AFTER INSERT OR UPDATE ON ticketing_cycle_time_histories
FOR EACH ROW EXECUTE FUNCTION update_sla_times();

-- Forcing the trigger to run for all records
UPDATE ticketing_cycle_time_histories
SET id=id;

SELECT * FROM ticketing_ticket WHERE sla_first_transitioned_at IS NOT NULL;

-- Verify that is sla_done_transitioned_at is none, that is doesn't have a 'Done' transition
-- Not a exhaustive test, just verified some random picks
SELECT * FROM ticketing_cycle_time_histories
WHERE ticket_id = 'aeeef108-e676-4dbe-a309-65a6c4beb180';

-- FINAL QUERY
-- We can still improve this, but I think I'm already pushing the limits of what I can do in the time I have, so I'm going to stop here.
-- We still have some partial table scans happening, from a glance, they are dict key style scans
-- We can also create a CTE to prevent calculating the SLA total time multiple times, but again, I'm leaving it here.
WITH search_tickets AS (
    SELECT
        DISTINCT tt.id
        , tt.created_at
        , tt.updated_at
        , tt.sla_first_transitioned_at
        , tt.sla_done_transitioned_at
    FROM ticketing_ticket tt
    LEFT JOIN ticketing_ticket_field_value AS ttfv ON (tt.id = ttfv.ticket_id)
    LEFT JOIN ticketing_fields AS tf ON (ttfv.ticket_field_id = tf.id)
    LEFT JOIN ticketing_field_options AS tfo ON (ttfv.select_reference_value_uuid = tfo.id)
    LEFT JOIN ticketing_field_status_options AS tfso ON (ttfv.status_reference_value_uuid = tfso.id)
    LEFT JOIN users u ON (ttfv.user_value = u.id)
    WHERE 
        tf.deleted_at IS NULL
        AND ttfv.search_value LIKE '%' || 'to do' || '%'
), 
sort_tickets AS (
    SELECT
        tt.id
        , tt.created_at
        , tt.updated_at
        , tt.sla_done_transitioned_at
        , tt.sla_first_transitioned_at

        , tf.field_type AS field_type
        , tf.name AS field_name

        , ttfv_sort.number_value AS field_number_value
        , ttfv_sort.string_value AS field_string_value
        , ttfv_sort.text_value AS field_text_value

        , tfso.label AS field_status_option_label
        , tfo.label AS field_select_option_label
    FROM 
        search_tickets AS tt
    LEFT JOIN ticketing_ticket_field_value AS ttfv_sort ON (tt.id = ttfv_sort.ticket_id AND ttfv_sort.ticket_field_id = '942bffd5-754f-49c3-9840-d62532ea1490')
    LEFT JOIN ticketing_fields AS tf ON (ttfv_sort.ticket_field_id = tf.id)
    LEFT JOIN ticketing_field_options AS tfo ON (ttfv_sort.select_reference_value_uuid = tfo.id)
    LEFT JOIN ticketing_field_status_options AS tfso ON (ttfv_sort.status_reference_value_uuid = tfso.id)
    LEFT JOIN users u ON (ttfv_sort.user_value = u.id)
    ORDER BY 
        -- Will be programmatically calculated in the app
        ttfv_sort.number_value ASC NULLS LAST, tt.created_at DESC
), 
limit_tickets AS (
    SELECT
        *
    FROM 
        sort_tickets
    LIMIT 10 OFFSET 0
)
SELECT 
    tt.id AS id
    , CASE tt.sla_done_transitioned_at
        WHEN NULL THEN format_duration(EXTRACT(EPOCH FROM (NOW() - tt.sla_first_transitioned_at))::bigint)
        ELSE format_duration(EXTRACT(EPOCH FROM (tt.sla_done_transitioned_at - tt.sla_first_transitioned_at))::bigint)
      END AS sla_total_time
    , CASE 
        WHEN tt.sla_done_transitioned_at IS NOT NULL AND tt.sla_done_transitioned_at - tt.sla_first_transitioned_at > INTERVAL '8 hours' THEN 'Breached'
        WHEN tt.sla_done_transitioned_at IS NULL AND NOW() - tt.sla_first_transitioned_at > INTERVAL '8 hours' THEN 'In Progress'
        ELSE 'Met'
      END AS sla_status

    , tf.field_type AS field_type
    , tf.name AS field_name

    , ttfv.number_value AS field_number_value
    , ttfv.string_value AS field_string_value
    , ttfv.text_value AS field_text_value

    , tfso.label AS field_status_option_label
    , tfo.label AS field_select_option_label

    , u.first_name AS user_first_name
    , u.last_name AS user_last_name
FROM limit_tickets AS tt
LEFT JOIN ticketing_ticket_field_value AS ttfv ON (tt.id = ttfv.ticket_id)
LEFT JOIN ticketing_fields AS tf ON (ttfv.ticket_field_id = tf.id)
LEFT JOIN ticketing_field_options AS tfo ON (ttfv.select_reference_value_uuid = tfo.id)
LEFT JOIN ticketing_field_status_options AS tfso ON (ttfv.status_reference_value_uuid = tfso.id)
LEFT JOIN users u ON (ttfv.user_value = u.id);

SELECT * FROM ticketing_ticket_field_value;

-- ANALYSIS
-- With the SLA start and end times pre-aggregated, we have halved the query time yet again (sounds like a lie, but I promise its not, from ~100ms to ~50ms on my machine)
-- I have learnt something here, I did not expect the history scan to be 50% of the query runtime, consider me educated!
-- With the SLA times pre-aggregated, we are no longer doing a full table scan. In fact we aren't even doing an index scan, the data is already there.
-- NO SCAN > index scan > ... > seq scan, NO SCAN is the holy grail

-- This is another scenario like the search_value situation where, this is an impressive gain for such a small dataset.
-- ...Previously the performance hit for the query would have be exponential as the dataset grew.

-- On some further tuning, and investigating, I've got the query down to 16-20ms. So in summary, from 200ms+ to <20ms, with some smart indexing and pre-aggregation. 
-- I honestly didn't think I'd get a literal 900% performance increase with such a small dataset.
-- It's likely you could half the time again by improving the way SLA formatted fields are calculated, but I'm not going to implement that. 
-- ... because the query is so fast now, I "think" that would be the next bottleneck.
