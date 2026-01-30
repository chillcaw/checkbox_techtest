import pool from '../../../db/pool.js';
import { Field, StatusGroup } from '../../types.js';

export class FieldsRepo {
  async getAllFields(accountId: number): Promise<Field[]> {
    const client = await pool.connect();
    
    try {
      const fieldsResult = await client.query(
        `SELECT id, account_id, name, field_type, description, metadata, system_field
         FROM ticketing_fields
         WHERE account_id = $1 AND deleted_at IS NULL
         ORDER BY name`,
        [accountId],
      );

      const fields: Field[] = [];

      for (const row of fieldsResult.rows) {
        const field: Field = {
          id: row.id,
          accountId: row.account_id,
          name: row.name,
          fieldType: row.field_type,
          description: row.description,
          metadata: row.metadata,
          systemField: row.system_field,
        };

        // Fetch options for select fields
        if (row.field_type === 'select') {
          const optionsResult = await client.query(
            `SELECT id, label, sequence
             FROM ticketing_field_options
             WHERE ticket_field_id = $1 AND deleted_at IS NULL
             ORDER BY sequence`,
            [row.id],
          );
          field.options = optionsResult.rows.map((opt) => ({
            id: opt.id,
            label: opt.label,
            sequence: opt.sequence,
          }));
        }

        // Fetch status options for status fields
        if (row.field_type === 'status') {
          const statusResult = await client.query(
            `SELECT tfso.id, tfso.label, tfso.group_id, tfsg.name as group_name, tfso.sequence
             FROM ticketing_field_status_options tfso
             JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
             WHERE tfso.ticket_field_id = $1 AND tfso.deleted_at IS NULL
             ORDER BY tfso.sequence`,
            [row.id],
          );
          field.statusOptions = statusResult.rows.map((opt) => ({
            id: opt.id,
            label: opt.label,
            groupId: opt.group_id,
            groupName: opt.group_name,
            sequence: opt.sequence,
          }));
        }

        fields.push(field);
      }

      return fields;
    } finally {
      client.release();
    }
  }

  async getStatusGroups(accountId: number): Promise<StatusGroup[]> {
    const client = await pool.connect();
    
    try {
      const result = await client.query(
        `SELECT id, name, sequence
         FROM ticketing_field_status_groups
         WHERE account_id = $1 AND deleted_at IS NULL
         ORDER BY sequence`,
        [accountId],
      );

      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        sequence: row.sequence,
      }));
    } finally {
      client.release();
    }
  }

  async getCurrencyOptions(accountId: number) {
    const client = await pool.connect();
    
    try {
      const result = await client.query(
        `SELECT id, code, name, symbol, sequence
         FROM ticketing_currency_field_options
         WHERE account_id = $1 AND deleted_at IS NULL
         ORDER BY sequence`,
        [accountId],
      );

      return result.rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        symbol: row.symbol,
        sequence: row.sequence,
      }));
    } finally {
      client.release();
    }
  }
}

export default FieldsRepo;

