import { Request, Response } from 'express';
import { FieldsRepo } from '../../fields/repo/fields_repo.js';
import logger from '../../../utils/logger.js';

export async function getFields(_req: Request, res: Response) {
  try {
    // Default account ID (in production, this would come from authentication)
    const accountId = 1;

    const fieldsRepo = new FieldsRepo();
    const fields = await fieldsRepo.getAllFields(accountId);
    const statusGroups = await fieldsRepo.getStatusGroups(accountId);
    const currencyOptions = await fieldsRepo.getCurrencyOptions(accountId);

    res.json({
      fields,
      statusGroups,
      currencyOptions,
    });
  } catch (error) {
    logger.error('Error fetching fields', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
}

