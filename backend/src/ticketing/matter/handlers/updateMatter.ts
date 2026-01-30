import { Request, Response } from 'express';
import { MatterService } from '../service/matter_service.js';
import { z } from 'zod';
import logger from '../../../utils/logger.js';

const updateSchema = z.object({
  fieldId: z.string().uuid(),
  fieldType: z.enum(['text', 'number', 'select', 'date', 'currency', 'boolean', 'status', 'user']),
  value: z.any(),
});

export async function updateMatter(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ error: 'Matter ID is required' });
      return;
    }

    const body = updateSchema.parse(req.body);
    
    // Default user ID (in production, this would come from authentication)
    const userId = 1;

    const matterService = new MatterService();
    await matterService.updateMatter(id, body.fieldId, body.fieldType, body.value, userId);

    // Return updated matter
    const updatedMatter = await matterService.getMatterById(id);
    
    res.json(updatedMatter);
  } catch (error) {
    logger.error('Error updating matter', { error, matterId: req.params.id });
    
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Invalid request body',
        details: error.errors,
      });
      return;
    }

    res.status(500).json({ error: 'Internal server error' });
  }
}

