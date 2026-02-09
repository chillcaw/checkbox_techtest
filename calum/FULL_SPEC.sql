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
-- ALL TOGETHER BABY PLAYGROUND
------------------------------
-- Remember CTEs aren't materialized unless the planner thinks its a good idea, usually in the case of LIMITs etc
-- Sort step needs to be done seperately, if there are two fields of the same time we want to distinguish between them
EXPLAIN (ANALYSE, VERBOSE, BUFFERS)
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
            ttfv.string_value ILIKE '%Contract%'
            -- OR ttfv.number_value::TEXT ILIKE '%' || 'Contract' || '%'
            OR ttfv.text_value ILIKE '%Contract%'
            -- We need a single searchable field, the second I add any more fields to search postgres doesn't actually use the indexes
            -- We're looking for bitmapOr and the 2x bitmap indexes string_value and text_value
            -- I'm not going to implement this, I asked the question and haven't heard back so I'm going to assume this is out of scope
            -- If we don't have a single searchable field, postgres is going to seq scan 90,000 records.
            -- RULE OF THUMB: Just because an index exists, doesn't mean postgres will use it, and with large or where clauses it rarely will
            OR ttfv.number_value::TEXT ILIKE '%Contract%'
            OR tfo.label = 'Contract'
            OR tfso.label = 'Contract'
            OR u.first_name = 'Contract'
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
