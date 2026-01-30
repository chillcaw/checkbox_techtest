import { Request, Response } from 'express';
import { MatterService } from '../service/matter_service.js';
import logger from '../../../utils/logger.js';

export async function getMatterDetails(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ error: 'Matter ID is required' });
      return;
    }

    const matterService = new MatterService();
    const matter = await matterService.getMatterById(id);

    if (!matter) {
      res.status(404).json({ error: 'Matter not found' });
      return;
    }

    res.json(matter);
  } catch (error) {
    logger.error('Error fetching matter details', { error, matterId: req.params.id });
    res.status(500).json({ error: 'Internal server error' });
  }
}

