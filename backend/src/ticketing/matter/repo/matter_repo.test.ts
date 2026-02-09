import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import MatterRepo from './matter_repo';
import { Pool, PoolClient, QueryResult } from 'pg';
import { mock } from 'node:test';

vi.mock('../../../utils/logger');

// Not exhaustive at all, as I ran out of time.
// I have documented ways we can refactor getMatters to make it easier / more reliable to test
describe('MatterRepo', () => {
  let matterRepo: MatterRepo;
  let mockClient: any;
  let pool: Pool;

  beforeEach(() => {
    // any is fine for now
    // We could create a DBClient interface with query and release
    // that is the type used for the pool in MatterRepo, and then use that interface here for better type safety
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    } as any;

    pool = {
      connect: vi.fn().mockResolvedValue(mockClient),
      release: vi.fn(),
    } as any;

    matterRepo = new MatterRepo(pool);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getMatters', () => {
    it('should return empty matters and total when no results found', async () => {
      // Needed to handle Promise.all in getMatters
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await matterRepo.getMatters({ page: 1, limit: 25 });

      expect(result).toEqual({ matters: [], total: 0 });
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should return paginated matters with default sorting', async () => {
      const mockMatterRow = {
        id: 'matter-1',
        board_id: 'board-1',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
        sla_first_transitioned_at: new Date('2024-01-01'),
        sla_done_transitioned_at: null,
        sla_total_time: 3600,
        sla_total_time_formatted: '1h',
        sla_status: 'In Progress',
        _field_type: null,
        _field_name: null,
        _field_id: null,
        _field_number_value: null,
        _field_string_value: null,
        _field_text_value: null,
        _field_currency_value: null,
        _field_date_value: null,
        _field_boolean_value: null,
        _field_status_id: null,
        _field_status_group_name: null,
        _field_status_option_label: null,
        _field_select_option_label: null,
        _field_user_id: null,
        _field_user_first_name: null,
        _field_user_last_name: null,
        _field_user_email: null,
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: [mockMatterRow] });
      });

      const result = await matterRepo.getMatters({ page: 1, limit: 25 });

      expect(result.total).toBe(1);
      expect(result.matters).toHaveLength(1);
      expect(result.matters[0].id).toBe('matter-1');
      expect(result.matters[0].sla).toBe('In Progress');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should apply search condition', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await matterRepo.getMatters({ page: 1, limit: 25, search: 'test search' });

      expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), ['test search']);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should handle custom field sorting', async () => {
      vi.spyOn(matterRepo, 'getFieldByName').mockResolvedValueOnce({
        id: 'field-1',
        field_type: 'text',
      });

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await matterRepo.getMatters({ page: 1, limit: 25, sortBy: 'customField' });

      expect(matterRepo.getFieldByName).toHaveBeenCalledWith('customField');
      expect(mockClient.query).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should default to createdAt sorting when invalid field provided', async () => {
      vi.spyOn(matterRepo, 'getFieldByName').mockResolvedValueOnce(null);

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await matterRepo.getMatters({ page: 1, limit: 25, sortBy: 'nonexistentField' });

      const query = mockClient.query.mock.calls[1][0];
      expect(query).toContain('ORDER BY tt.created_at');
    });

    it('should release client in finally block on error', async () => {
      mockClient.query.mockRejectedValueOnce(new Error('DB Error'));

      await expect(matterRepo.getMatters({ page: 1, limit: 25 })).rejects.toThrow('DB Error');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should parse number_values correctly', async () => {
      const mockMatterRow = {
        id: 'matter-1',
        board_id: 'board-1',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
        sla_first_transitioned_at: new Date('2024-01-01'),
        sla_done_transitioned_at: new Date('2024-01-03'),
        sla_total_time: 172800,
        sla_total_time_formatted: '2d',
        sla_status: 'Met',
        _field_type: 'number',
        _field_name: 'priority',
        _field_id: 'field-1',
        _field_number_value: 5,
        _field_string_value: null,
        _field_text_value: null,
        _field_currency_value: null,
        _field_date_value: null,
        _field_boolean_value: null,
        _field_status_id: null,
        _field_status_group_name: null,
        _field_status_option_label: null,
        _field_select_option_label: null,
        _field_user_id: null,
        _field_user_first_name: null,
        _field_user_last_name: null,
        _field_user_email: null,
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: [mockMatterRow] });
      });

      const result = await matterRepo.getMatters({});

      expect(result.matters[0].fields.priority.value).toBe(5);
      expect(result.matters[0].fields.priority.displayValue).toBe('5');
    });

    it('should parse date_values correctly (ignoring timestamps)', async () => {
      const mockMatterRow = {
        id: 'matter-1',
        board_id: 'board-1',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
        sla_first_transitioned_at: new Date('2024-01-01'),
        sla_done_transitioned_at: new Date('2024-01-03'),
        sla_total_time: 172800,
        sla_total_time_formatted: '2d',
        sla_status: 'Met',
        _field_type: 'date',
        _field_name: 'dueDate',
        _field_id: 'field-2',
        _field_number_value: null,
        _field_string_value: null,
        _field_text_value: null,
        _field_currency_value: null,
        _field_date_value: new Date('2024-02-01'),
        _field_boolean_value: null,
        _field_status_id: null,
        _field_status_group_name: null,
        _field_status_option_label: null,
        _field_select_option_label: null,
        _field_user_id: null,
        _field_user_first_name: null,
        _field_user_last_name: null,
        _field_user_email: null,
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: [mockMatterRow] });
      });

      const result = await matterRepo.getMatters({});
      expect((result.matters[0].fields.dueDate.value as Date).toISOString()).toBe(
        '2024-02-01T00:00:00.000Z',
      );
      expect(result.matters[0].fields.dueDate.displayValue).toBe('01/02/2024');
    });

    it('should parse boolean_values correctly', async () => {
      const mockMatterRow = {
        id: 'matter-1',
        board_id: 'board-1',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
        sla_first_transitioned_at: new Date('2024-01-01'),
        sla_done_transitioned_at: new Date('2024-01-03'),
        sla_total_time: 172800,
        sla_total_time_formatted: '2d',
        sla_status: 'Met',
        _field_type: 'boolean',
        _field_name: 'isActive',
        _field_id: 'field-3',
        _field_number_value: null,
        _field_string_value: null,
        _field_text_value: null,
        _field_currency_value: null,
        _field_date_value: null,
        _field_boolean_value: true,
        _field_status_id: null,
        _field_status_group_name: null,
        _field_status_option_label: null,
        _field_select_option_label: null,
        _field_user_id: null,
        _field_user_first_name: null,
        _field_user_last_name: null,
        _field_user_email: null,
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: [mockMatterRow] });
      });

      const result = await matterRepo.getMatters({});
      expect(result.matters[0].fields.isActive.value).toBe(true);
      expect(result.matters[0].fields.isActive.displayValue).toBe('✓');
    });

    it('should parse currency_values correctly', async () => {
      const mockMatterRow = {
        id: 'matter-1',
        board_id: 'board-1',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
        sla_first_transitioned_at: new Date('2024-01-01'),
        sla_done_transitioned_at: new Date('2024-01-03'),
        sla_total_time: 172800,
        sla_total_time_formatted: '2d',
        sla_status: 'Met',
        _field_type: 'currency',
        _field_name: 'amount',
        _field_id: 'field-4',
        _field_number_value: null,
        _field_string_value: null,
        _field_text_value: null,
        _field_currency_value: { amount: 1500.5, currency: 'USD' },
        _field_date_value: null,
        _field_boolean_value: null,
        _field_status_id: null,
        _field_status_group_name: null,
        _field_status_option_label: null,
        _field_select_option_label: null,
        _field_user_id: null,
        _field_user_first_name: null,
        _field_user_last_name: null,
        _field_user_email: null,
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: [mockMatterRow] });
      });

      const result = await matterRepo.getMatters({});
      expect(result.matters[0].fields.amount.value).toEqual({ amount: 1500.5, currency: 'USD' });
      expect(result.matters[0].fields.amount.displayValue).toBe('1,500.5 USD');
    });

    it('should parse user_values correctly', async () => {
      const mockMatterRow = {
        id: 'matter-1',
        board_id: 'board-1',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
        sla_first_transitioned_at: new Date('2024-01-01'),
        sla_done_transitioned_at: new Date('2024-01-03'),
        sla_total_time: 172800,
        sla_total_time_formatted: '2d',
        sla_status: 'Met',
        _field_type: 'user',
        _field_name: 'assignee',
        _field_id: 'field-5',
        _field_number_value: null,
        _field_string_value: null,
        _field_text_value: null,
        _field_currency_value: null,
        _field_date_value: null,
        _field_boolean_value: null,
        _field_status_id: null,
        _field_status_group_name: null,
        _field_status_option_label: null,
        _field_select_option_label: null,
        _field_user_id: 'user-1',
        _field_user_first_name: 'John',
        _field_user_last_name: 'Doe',
        _field_user_email: 'john@example.com',
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: [mockMatterRow] });
      });

      const result = await matterRepo.getMatters({});
      expect(result.matters[0].fields.assignee.value).toEqual({
        id: 'user-1',
        email: 'john@example.com',
        firstName: 'John',
        lastName: 'Doe',
        displayName: 'John Doe',
      });
      expect(result.matters[0].fields.assignee.displayValue).toBe('John Doe');
    });

    it('should parse select_values correctly', async () => {
      const mockMatterRow = {
        id: 'matter-1',
        board_id: 'board-1',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
        sla_first_transitioned_at: new Date('2024-01-01'),
        sla_done_transitioned_at: new Date('2024-01-03'),
        sla_total_time: 172800,
        sla_total_time_formatted: '2d',
        sla_status: 'Met',
        _field_type: 'select',
        _field_name: 'category',
        _field_id: 'field-6',
        _field_number_value: null,
        _field_string_value: null,
        _field_text_value: null,
        _field_currency_value: null,
        _field_date_value: null,
        _field_boolean_value: null,
        _field_status_id: null,
        _field_status_group_name: null,
        _field_status_option_label: null,
        _field_select_option_label: 'Bug',
        _field_user_id: null,
        _field_user_first_name: null,
        _field_user_last_name: null,
        _field_user_email: null,
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: [mockMatterRow] });
      });

      const result = await matterRepo.getMatters({});
      expect(result.matters[0].fields.category.displayValue).toBe('Bug');
    });

    it('should parse status_values correctly', async () => {
      const mockMatterRow = {
        id: 'matter-1',
        board_id: 'board-1',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
        sla_first_transitioned_at: new Date('2024-01-01'),
        sla_done_transitioned_at: new Date('2024-01-03'),
        sla_total_time: 172800,
        sla_total_time_formatted: '2d',
        sla_status: 'Met',
        _field_type: 'status',
        _field_name: 'workflowStatus',
        _field_id: 'field-7',
        _field_number_value: null,
        _field_string_value: null,
        _field_text_value: null,
        _field_currency_value: null,
        _field_date_value: null,
        _field_boolean_value: null,
        _field_status_id: 'status-1',
        _field_status_group_name: 'In Progress',
        _field_status_option_label: 'Review',
        _field_select_option_label: null,
        _field_user_id: null,
        _field_user_first_name: null,
        _field_user_last_name: null,
        _field_user_email: null,
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: [mockMatterRow] });
      });

      const result = await matterRepo.getMatters({});
      expect(result.matters[0].fields.workflowStatus.value).toEqual({
        statusId: 'status-1',
        groupName: 'In Progress',
      });
      expect(result.matters[0].fields.workflowStatus.displayValue).toBe('Review');
    });

    it('should parse text_values correctly with fallback to string_value', async () => {
      const mockMatterRow = {
        id: 'matter-1',
        board_id: 'board-1',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
        sla_first_transitioned_at: new Date('2024-01-01'),
        sla_done_transitioned_at: new Date('2024-01-03'),
        sla_total_time: 172800,
        sla_total_time_formatted: '2d',
        sla_status: 'Met',
        _field_type: 'text',
        _field_name: 'description',
        _field_id: 'field-8',
        _field_number_value: null,
        _field_string_value: 'fallback text',
        _field_text_value: 'main text',
        _field_currency_value: null,
        _field_date_value: null,
        _field_boolean_value: null,
        _field_status_id: null,
        _field_status_group_name: null,
        _field_status_option_label: null,
        _field_select_option_label: null,
        _field_user_id: null,
        _field_user_first_name: null,
        _field_user_last_name: null,
        _field_user_email: null,
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }
        return Promise.resolve({ rows: [mockMatterRow] });
      });

      const result = await matterRepo.getMatters({});
      expect(result.matters[0].fields.description.value).toBe('main text');
    });

    it('should give the right sla formatted time and status', async () => {
      const mockMatterRow = {
        id: 'matter-1',
        board_id: 'board-1',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
        sla_first_transitioned_at: new Date('2024-01-01'),
        sla_done_transitioned_at: new Date('2024-01-03'),
        sla_total_time: 172800,
        sla_total_time_formatted: '2d',
        sla_status: 'Met',
        _field_type: null,
        _field_name: null,
        _field_id: null,
        _field_number_value: null,
        _field_string_value: null,
        _field_text_value: null,
        _field_currency_value: null,
        _field_date_value: null,
        _field_boolean_value: null,
        _field_status_id: null,
        _field_status_group_name: null,
        _field_status_option_label: null,
        _field_select_option_label: null,
        _field_user_id: null,
        _field_user_first_name: null,
        _field_user_last_name: null,
        _field_user_email: null,
      };

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '1' }] });
        }

        return Promise.resolve({ rows: [mockMatterRow] });
      });

      const result = await matterRepo.getMatters({ page: 1, limit: 25 });

      expect(result.total).toBe(1);
      expect(result.matters).toHaveLength(1);
      expect(result.matters[0].id).toBe('matter-1');
      expect(result.matters[0].sla).toBe('Met');
      expect(result.matters[0].cycleTime).toEqual({
        resolutionTimeMs: 172800000,
        resolutionTimeFormatted: '2d',
        isInProgress: false,
        startedAt: new Date('2024-01-01'),
        completedAt: new Date('2024-01-03'),
      });
    });

    it('should use limit and offset for pagination', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '100' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await matterRepo.getMatters({ page: 2, limit: 25 });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        // Offset & Limit calculation: (page - 1) * limit, limit
        expect.arrayContaining([(2 - 1) * 25, 25]),
      );
    });

    it('should default to page 1 and limit 25 if not provided', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await matterRepo.getMatters({});

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([0, 25]),
      );
    });

    it('should default to descending order when sortOrder not provided', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await matterRepo.getMatters({});

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('DESC'),
        expect.any(Array),
      );
    });

    it('should call query with fieldId $4 when sorting by a custom field', async () => {
      vi.spyOn(matterRepo, 'getFieldByName').mockResolvedValueOnce({
        id: 'field-1',
        field_type: 'text',
      });

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.toLowerCase().includes('count')) {
          return Promise.resolve({ rows: [{ count: '0' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      await matterRepo.getMatters({ sortBy: 'customField' });

      // We can do much more extensive checks than this,
      // but I'm going to leave testing here.
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('$4'),
        expect.arrayContaining(['field-1']),
      );
    });
  });
});
