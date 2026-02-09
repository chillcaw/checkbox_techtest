import { Request, Response } from 'express';
import { MatterService } from '../service/matter_service.js';
import { z } from 'zod';
import logger from '../../../utils/logger.js';

const querySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 25)),
  sortBy: z.string().optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  // CALUM: Very tempted to say you can only search if you provide at least 3 characters (or empty)
  // CALUM: Give them a bad request if their search is 1-2 characters
  search: z.string().optional().default(''),
});

export async function getMatters(req: Request, res: Response): Promise<void> {
  try {
    const params = querySchema.parse(req.query);

    const matterService = new MatterService();
    const result = await matterService.getMatters(params);

    // CALUM: Enforcing a minimum search length of 3 characters
    // if (params.search && params.search.length > 0 && params.search.length < 3) {
    //   res.status(400).json({
    //     error: 'Search term must be at least 3 characters long',
    //   });
    //   return;
    // }

    res.json(result);
  } catch (error) {
    logger.error('Error fetching matters', { error });

    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: error.errors,
      });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
}
