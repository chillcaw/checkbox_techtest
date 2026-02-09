-- Final SQL Schema Changes for Matter Management System
-- This file contains all the ALTER TABLE statements, INDEXES, TRIGGERS, and FUNCTIONS
-- needed to implement the performance optimizations documented in /calum

-- ============================================================================
-- SQL FUNCTIONS
-- ============================================================================

-- Format duration in seconds to human-readable format (e.g., "2h 30m", "3d 5h")
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

-- ============================================================================
-- TABLE ALTERATIONS
-- ============================================================================

-- Add search_value column for efficient fuzzy searching
ALTER TABLE ticketing_ticket_field_value 
ADD COLUMN search_value TEXT;

-- Add SLA timing columns for pre-aggregated SLA calculations
ALTER TABLE ticketing_ticket 
ADD COLUMN sla_first_transitioned_at TIMESTAMPTZ;

ALTER TABLE ticketing_ticket 
ADD COLUMN sla_done_transitioned_at TIMESTAMPTZ;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- GIN Trigram index for fast fuzzy search on search_value column
CREATE INDEX idx_ticketing_ticket_field_value_search_value 
ON ticketing_ticket_field_value 
USING gin (search_value gin_trgm_ops);

-- ============================================================================
-- TRIGGER FUNCTIONS
-- ============================================================================

-- Trigger function to populate search_value column on INSERT/UPDATE
-- Aggregates searchable content from various field types into a single lowercase indexed column
CREATE OR REPLACE FUNCTION update_search_value()
RETURNS TRIGGER AS $$
DECLARE
    var_field_type TEXT;
BEGIN
    SELECT tf.field_type INTO var_field_type
    FROM ticketing_fields tf
    WHERE tf.id = NEW.ticket_field_id;

    IF var_field_type = 'text' THEN
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
        NEW.search_value := lower(coalesce(
          (SELECT u.first_name || ' ' || u.last_name
           FROM users u
           WHERE u.id = NEW.user_value),
          ''));
    ELSE
        NEW.search_value := NULL;
    END IF;

    RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Trigger function to pre-aggregate SLA start and end times for each ticket
-- Runs on INSERT/UPDATE to ticketing_cycle_time_histories and updates parent ticketing_ticket
CREATE OR REPLACE FUNCTION update_sla_times()
RETURNS TRIGGER AS $$
DECLARE
    first_transitioned_at TIMESTAMPTZ;
    done_transitioned_at TIMESTAMPTZ;
BEGIN
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

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to automatically populate search_value on INSERT/UPDATE
CREATE TRIGGER trg_update_search_value
BEFORE INSERT OR UPDATE ON ticketing_ticket_field_value
FOR EACH ROW 
EXECUTE FUNCTION update_search_value();

-- Trigger to automatically update SLA timing columns on cycle time history changes
CREATE TRIGGER trg_update_sla_times
AFTER INSERT OR UPDATE ON ticketing_cycle_time_histories
FOR EACH ROW 
EXECUTE FUNCTION update_sla_times();

-- ============================================================================
-- BACKFILL EXISTING DATA
-- ============================================================================

-- Backfill search_value for all existing records
UPDATE ticketing_ticket_field_value
SET id = id;

-- Backfill SLA times for all existing records
UPDATE ticketing_cycle_time_histories
SET id = id;
