import {
  Matter,
  MatterListParams,
  FieldValue,
  UserValue,
  CurrencyValue,
  StatusValue,
  SLAStatus,
} from '../../types.js';
import logger from '../../../utils/logger.js';
import { Pool, PoolClient } from 'pg';

export class MatterRepo {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async getFieldByName(fieldName: string): Promise<null | { id: string; field_type: string }> {
    const client = await this.pool.connect();

    try {
      const fieldResult = await client.query(
        `SELECT id, field_type FROM ticketing_fields WHERE name ILIKE $1 LIMIT 1`,
        [fieldName],
      );

      if (fieldResult.rows.length === 0) {
        return null;
      }

      return fieldResult.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Get paginated list of matters with search and sorting
   *
   * TODO: Implement search functionality
   * - Search across text, number, and other field types
   * - Use PostgreSQL pg_trgm extension for fuzzy matching
   * - Consider performance with proper indexing
   * - Support searching cycle times and SLA statuses
   *
   * Search Requirements:
   * - Text fields: Use ILIKE with pg_trgm indexes
   * - Number fields: Convert to text for search
   * - Status fields: Search by label
   * - User fields: Search by name
   * - Consider debouncing on frontend (already implemented)
   *
   * Performance Considerations for 10× Load:
   * - Add GIN indexes on searchable columns
   * - Consider Elasticsearch for advanced search at scale
   * - Implement query result caching
   * - Use connection pooling effectively
   */
  async getMatters(params: MatterListParams): Promise<{ total: number; matters: Matter[] }> {
    const { page = 1, limit = 25, sortBy = 'created_at', search = '', sortOrder = 'desc' } = params;
    const offset = (page - 1) * limit;

    const client = await this.pool.connect();

    try {
      // Was here before I started, I'm going to opt for static indexes, see below
      let paramIndex = 0;

      // Param Index Key:
      // $1 = search
      // $2 = limit
      // $3 = offset
      // $4 = fieldId (if sorting by field and that field exists)

      const searchCondition = params.search?.toLocaleLowerCase();

      const nonFieldSortMapping: Record<string, string> = {
        createdAt: 'tt.created_at',
        updatedAt: 'tt.updated_at',
        // Unimplemented
        // You can use the similarity() sort option though
        // bestMatch: 'tt.best_match',
      };

      const defaultSortField = 'createdAt';

      const { sortField, fieldId } = await (async () => {
        const defaultSortConfig = {
          sortField: nonFieldSortMapping[defaultSortField],
          fieldId: null,
        };

        // Catch default first, when sortBy is empty
        if (!sortBy) {
          return defaultSortConfig;
        }

        // Check if sortBy is one of the non-field based sorting options
        if (nonFieldSortMapping[sortBy] !== undefined) {
          return { sortField: nonFieldSortMapping[sortBy], fieldId: null };
        }

        const field = await this.getFieldByName(sortBy);

        // If we can't find the field by name, we'll resort to default sorting.
        // Depending on how we want to handle this, we could also throw an error instead and give feedback with a 400 bad request, but for now I'll just default to created_at
        if (field === null) {
          return defaultSortConfig;
        }

        const fieldType = field.field_type;
        const fieldId = field.id;

        const sortField = (function () {
          switch (fieldType) {
            case 'text':
              return `ttfv.text_value`;
            case 'number':
              return `ttfv.number_value`;
            case 'date':
              return `ttfv.date_value`;
            case 'boolean':
              return `ttfv.boolean_value`;
            case 'user':
              return `u.first_name`;
            case 'select':
              return `tfo.label`;
            case 'status':
              return `tfso.label`;
            default:
              return null;
          }
        })();

        // Field exists but is not a supported type for sorting, e.g: currency
        // Again instead of leniently defaulting here, we could throw an error and return a 400 bad request with feedback about unsupported sorting field
        if (sortField === null) {
          return defaultSortConfig;
        }

        // Param Index $1
        return { sortField, fieldId };
      })();

      const sortOrder = (function () {
        switch (params.sortOrder) {
          case 'asc':
            return 'ASC';
          case 'desc':
            return 'DESC';
          default:
            return 'DESC';
        }
      })();

      // Can be done with another CTE, but I'll just run in parallel to the other query
      const countQuery = `
SELECT
    COUNT(DISTINCT tt.id) AS count
FROM ticketing_ticket tt
LEFT JOIN ticketing_ticket_field_value AS ttfv ON (tt.id = ttfv.ticket_id)
LEFT JOIN ticketing_fields AS tf ON (ttfv.ticket_field_id = tf.id)
LEFT JOIN ticketing_field_options AS tfo ON (ttfv.select_reference_value_uuid = tfo.id)
LEFT JOIN ticketing_field_status_options AS tfso ON (ttfv.status_reference_value_uuid = tfso.id)
LEFT JOIN users u ON (ttfv.user_value = u.id)
WHERE
    tf.deleted_at IS NULL
    AND ttfv.search_value LIKE '%' || $1 || '%'
`;

      const matterQuery = `
WITH search_tickets AS (
    SELECT
    DISTINCT tt.id
        , tt.board_id
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
        AND ttfv.search_value LIKE '%' || $1 || '%'
),
sort_tickets AS (
    SELECT
        tt.id
        , tt.board_id
        , tt.created_at
        , tt.updated_at
        , tt.sla_done_transitioned_at
        , tt.sla_first_transitioned_at

        -- We have to select fields that are ordered, this is a catch all
        ${
          fieldId
            ? `
        , tf.field_type AS field_type
        , tf.name AS field_name
        , ttfv.number_value AS field_number_value
        , ttfv.string_value AS field_string_value
        , ttfv.text_value AS field_text_value
        , ttfv.date_value AS field_date_value
        , ttfv.boolean_value AS field_boolean_value

        , tfso.label AS field_status_option_label
        , tfo.label AS field_select_option_label

        , u.first_name AS user_first_name
            `
            : ''
        }
    FROM
        search_tickets AS tt
    -- We'll opt out of the joins if we don't need them for sorting
    ${
      fieldId
        ? `
    LEFT JOIN ticketing_ticket_field_value AS ttfv ON (tt.id = ttfv.ticket_id AND ttfv.ticket_field_id = $4)
    LEFT JOIN ticketing_fields AS tf ON (ttfv.ticket_field_id = tf.id)
    LEFT JOIN ticketing_field_options AS tfo ON (ttfv.select_reference_value_uuid = tfo.id)
    LEFT JOIN ticketing_field_status_options AS tfso ON (ttfv.status_reference_value_uuid = tfso.id)
    LEFT JOIN users u ON (ttfv.user_value = u.id)
        `
        : ''
    }
    ORDER BY ${sortField} ${sortOrder} NULLS LAST, tt.created_at DESC
),
limit_tickets AS (
    SELECT *
    FROM sort_tickets
    LIMIT $2 OFFSET $3
)
SELECT
    tt.id AS id
    , tt.board_id AS board_id
    , tt.sla_first_transitioned_at AS sla_first_transitioned_at
    , tt.sla_done_transitioned_at AS sla_done_transitioned_at
    , tt.created_at AS created_at
    , tt.updated_at AS updated_at

    , CASE tt.sla_done_transitioned_at
        WHEN NULL THEN EXTRACT(EPOCH FROM (NOW() - tt.sla_first_transitioned_at))::bigint
        ELSE EXTRACT(EPOCH FROM (tt.sla_done_transitioned_at - tt.sla_first_transitioned_at))::bigint
      END AS sla_total_time

    , CASE tt.sla_done_transitioned_at
        WHEN NULL THEN format_duration(EXTRACT(EPOCH FROM (NOW() - tt.sla_first_transitioned_at))::bigint)
        ELSE format_duration(EXTRACT(EPOCH FROM (tt.sla_done_transitioned_at - tt.sla_first_transitioned_at))::bigint)
      END AS sla_total_time_formatted

    , CASE
        WHEN tt.sla_done_transitioned_at IS NOT NULL AND tt.sla_done_transitioned_at - tt.sla_first_transitioned_at > INTERVAL '8 hours' THEN 'Breached'
        WHEN tt.sla_done_transitioned_at IS NULL AND NOW() - tt.sla_first_transitioned_at < INTERVAL '8 hours' THEN 'In Progress'
        ELSE 'Met'
      END AS sla_status

    , tf.field_type AS _field_type
    , tf.name AS _field_name

    , ttfv.ticket_field_id AS _field_id
    , ttfv.number_value AS _field_number_value
    , ttfv.string_value AS _field_string_value
    , ttfv.text_value AS _field_text_value
    , ttfv.currency_value AS _field_currency_value

    , ttfv.date_value AS _field_date_value
    , ttfv.boolean_value AS _field_boolean_value

    , tfso.id AS _field_status_id
    , tfsg.name AS _field_status_group_name
    , tfso.label AS _field_status_option_label

    , tfo.label AS _field_select_option_label

    , u.id AS _field_user_id
    , u.first_name AS _field_user_first_name
    , u.last_name AS _field_user_last_name
    , u.email AS _field_user_email
FROM limit_tickets AS tt
LEFT JOIN ticketing_ticket_field_value AS ttfv ON (tt.id = ttfv.ticket_id)
LEFT JOIN ticketing_fields AS tf ON (ttfv.ticket_field_id = tf.id)
LEFT JOIN ticketing_field_options AS tfo ON (ttfv.select_reference_value_uuid = tfo.id)
LEFT JOIN ticketing_field_status_options AS tfso ON (ttfv.status_reference_value_uuid = tfso.id)
LEFT JOIN ticketing_field_status_groups AS tfsg ON (tfso.group_id = tfsg.id)
LEFT JOIN users u ON (ttfv.user_value = u.id);`;

      // In the case of a ticketing_ticket column, field_id will be null.
      // $1-3 if no fieldId, $1-4 if fieldId exists
      const preparedParams = [searchCondition, limit, offset, fieldId].filter(
        (param) => param !== null,
      );

      const queryResults = await Promise.all([
        client.query(countQuery, [searchCondition]),
        client.query(matterQuery, preparedParams),
      ]);

      const [count, data] = queryResults;

      const total = parseInt(count.rows[0].count);
      const matterRecords = data.rows;

      if (total === 0) {
        return { matters: [], total: 0 };
      }

      if (matterRecords.length === 0) {
        return { matters: [], total };
      }

      const hydratedMatters: Record<string, Matter> = {};

      const prefix = (id: string) => `id-${id}`;

      for (const row of matterRecords) {
        // Maintain the order of the dataset
        const hydratedId = prefix(row.id);

        if (hydratedMatters[hydratedId] === undefined) {
          hydratedMatters[hydratedId] = {
            id: row.id,
            boardId: row.board_id,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            fields: {},
            // Implement later with cycle time service
            sla: row.sla_status as SLAStatus,
            cycleTime: {
              resolutionTimeMs: row.sla_total_time * 1000,
              resolutionTimeFormatted: row.sla_total_time_formatted,
              isInProgress: row.sla_done_transitioned_at === null,
              startedAt: row.sla_first_transitioned_at,
              completedAt: row.sla_done_transitioned_at,
            },
          };
        }

        hydratedMatters[hydratedId].fields[row._field_name] = {
          fieldId: row._field_id,
          fieldName: row._field_name,
          fieldType: row._field_type,
          value: (function () {
            switch (row._field_type) {
              case 'text':
                return row._field_text_value || row._field_string_value;
              case 'number':
                return row._field_number_value ? parseFloat(row._field_number_value) : null;
              case 'date':
                return row._field_date_value;
              case 'boolean':
                return row._field_boolean_value;
              case 'select':
                return row._field_select_option_label;
              case 'status':
                return {
                  statusId: row._field_status_id,
                  groupName: row._field_status_group_name,
                };
              case 'currency':
                return row._field_currency_value as CurrencyValue;
              case 'user':
                return row._field_user_first_name
                  ? ({
                      id: row._field_user_id,
                      email: row._field_user_email,
                      firstName: row._field_user_first_name,
                      lastName: row._field_user_last_name,
                      displayName: `${row._field_user_first_name} ${row._field_user_last_name}`,
                    } as UserValue)
                  : null;
              default:
                return null;
            }
          })(),
          displayValue: (function () {
            switch (row._field_type) {
              case 'number':
                return row._field_number_value
                  ? parseFloat(row._field_number_value).toLocaleString()
                  : undefined;
              case 'date':
                return row._field_date_value
                  ? new Date(row._field_date_value).toLocaleDateString()
                  : undefined;
              case 'boolean':
                return row._field_boolean_value ? '✓' : '✗';
              case 'currency':
                return row._field_currency_value
                  ? `${(row._field_currency_value as CurrencyValue).amount.toLocaleString()} ${(row._field_currency_value as CurrencyValue).currency}`
                  : undefined;
              case 'user':
                return row._field_user_first_name
                  ? `${row._field_user_first_name} ${row._field_user_last_name}`
                  : undefined;
              case 'status':
                return row._field_status_option_label;
              case 'select':
                return row._field_select_option_label;
              default:
                return undefined;
            }
          })(),
        };
      }

      return {
        matters: Object.values(hydratedMatters),
        total,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get a single matter by ID
   */
  async getMatterById(matterId: string): Promise<Matter | null> {
    const client = await this.pool.connect();

    try {
      const matterResult = await client.query(
        `SELECT id, board_id, created_at, updated_at
         FROM ticketing_ticket
         WHERE id = $1`,
        [matterId],
      );

      if (matterResult.rows.length === 0) {
        return null;
      }

      const matterRow = matterResult.rows[0];
      const fields = await this.getMatterFields(client, matterId);

      return {
        id: matterRow.id,
        boardId: matterRow.board_id,
        fields,
        createdAt: matterRow.created_at,
        updatedAt: matterRow.updated_at,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get all field values for a matter
   */
  private async getMatterFields(
    client: PoolClient,
    ticketId: string,
  ): Promise<Record<string, FieldValue>> {
    const fieldsResult = await client.query(
      `SELECT 
        ttfv.id,
        ttfv.ticket_field_id,
        tf.name as field_name,
        tf.field_type,
        ttfv.text_value,
        ttfv.string_value,
        ttfv.number_value,W
        ttfv.date_value,
        ttfv.boolean_value,
        ttfv.currency_value,
        ttfv.user_value,
        ttfv.select_reference_value_uuid,
        ttfv.status_reference_value_uuid,
        -- User data
        u.id as user_id,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        -- Select option label
        tfo.label as select_option_label,
        -- Status option data
        tfso.label as status_option_label,
        tfsg.name as status_group_name
       FROM ticketing_ticket_field_value ttfv
       JOIN ticketing_fields tf ON ttfv.ticket_field_id = tf.id
       LEFT JOIN users u ON ttfv.user_value = u.id
       LEFT JOIN ticketing_field_options tfo ON ttfv.select_reference_value_uuid = tfo.id
       LEFT JOIN ticketing_field_status_options tfso ON ttfv.status_reference_value_uuid = tfso.id
       LEFT JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
       - CALUM: We'll want a where in clause somewhere to prevent a query per matter
       WHERE ttfv.ticket_id = $1`,
      [ticketId],
    );

    const fields: Record<string, FieldValue> = {};

    for (const row of fieldsResult.rows) {
      let value: string | number | boolean | Date | CurrencyValue | UserValue | StatusValue | null =
        null;
      let displayValue: string | undefined = undefined;

      switch (row.field_type) {
        case 'text':
          value = row.text_value || row.string_value;
          break;
        case 'number':
          value = row.number_value ? parseFloat(row.number_value) : null;
          displayValue = value !== null ? value.toLocaleString() : undefined;
          break;
        case 'date':
          value = row.date_value;
          displayValue = row.date_value ? new Date(row.date_value).toLocaleDateString() : undefined;
          break;
        case 'boolean':
          value = row.boolean_value;
          displayValue = value ? '✓' : '✗';
          break;
        case 'currency':
          value = row.currency_value as CurrencyValue;
          if (row.currency_value) {
            displayValue = `${(row.currency_value as CurrencyValue).amount.toLocaleString()} ${(row.currency_value as CurrencyValue).currency}`;
          }
          break;
        case 'user':
          if (row.user_id) {
            const userValue: UserValue = {
              id: row.user_id,
              email: row.user_email,
              firstName: row.user_first_name,
              lastName: row.user_last_name,
              displayName: `${row.user_first_name} ${row.user_last_name}`,
            };
            value = userValue;
            displayValue = userValue.displayName;
          }
          break;
        case 'select':
          value = row.select_reference_value_uuid;
          displayValue = row.select_option_label;
          break;
        case 'status':
          value = row.status_reference_value_uuid;
          displayValue = row.status_option_label;
          // Store group name in metadata for SLA calculations
          if (row.status_group_name) {
            value = {
              statusId: row.status_reference_value_uuid,
              groupName: row.status_group_name,
            } as StatusValue;
          }
          break;
      }

      fields[row.field_name] = {
        fieldId: row.ticket_field_id,
        fieldName: row.field_name,
        fieldType: row.field_type,
        value,
        displayValue,
      };
    }

    return fields;
  }

  /**
   * Update a matter's field value
   */
  async updateMatterField(
    matterId: string,
    fieldId: string,
    fieldType: string,
    value: string | number | boolean | Date | CurrencyValue | UserValue | StatusValue | null,
    userId: number,
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Determine which column to update based on field type
      let columnName: string;
      let columnValue: string | number | boolean | Date | null = null;

      switch (fieldType) {
        case 'text':
          columnName = 'text_value';
          columnValue = value as string;
          break;
        case 'number':
          columnName = 'number_value';
          columnValue = value as number;
          break;
        case 'date':
          columnName = 'date_value';
          columnValue = value as Date;
          break;
        case 'boolean':
          columnName = 'boolean_value';
          columnValue = value as boolean;
          break;
        case 'currency':
          columnName = 'currency_value';
          columnValue = JSON.stringify(value);
          break;
        case 'user':
          columnName = 'user_value';
          columnValue = value as number;
          break;
        case 'select':
          columnName = 'select_reference_value_uuid';
          columnValue = value as string;
          break;
        case 'status': {
          columnName = 'status_reference_value_uuid';
          columnValue = value as string;

          // Track status change in cycle time history
          const currentStatusResult = await client.query(
            `SELECT status_reference_value_uuid 
             FROM ticketing_ticket_field_value 
             WHERE ticket_id = $1 AND ticket_field_id = $2`,
            [matterId, fieldId],
          );

          if (currentStatusResult.rows.length > 0) {
            const fromStatusId = currentStatusResult.rows[0].status_reference_value_uuid;

            await client.query(
              `INSERT INTO ticketing_cycle_time_histories 
               (ticket_id, status_field_id, from_status_id, to_status_id, transitioned_at)
               VALUES ($1, $2, $3, $4, NOW())`,
              [matterId, fieldId, fromStatusId, value],
            );
          }
          break;
        }
        default:
          throw new Error(`Unsupported field type: ${fieldType}`);
      }

      // Upsert field value
      await client.query(
        `INSERT INTO ticketing_ticket_field_value 
         (ticket_id, ticket_field_id, ${columnName}, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (ticket_id, ticket_field_id)
         DO UPDATE SET ${columnName} = $3, updated_by = $5, updated_at = NOW()`,
        [matterId, fieldId, columnValue, userId, userId],
      );

      // Update matter's updated_at
      await client.query(`UPDATE ticketing_ticket SET updated_at = NOW() WHERE id = $1`, [
        matterId,
      ]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating matter field', { error, matterId, fieldId });
      throw error;
    } finally {
      client.release();
    }
  }
}

export default MatterRepo;
