import { Router } from 'express';
import { getMatters } from './handlers/getMatters.js';
import { getMatterDetails } from './handlers/getMatterDetails.js';
import { updateMatter } from './handlers/updateMatter.js';
import { getFields } from './handlers/getFields.js';

export const matterRouter = Router();

// Matter endpoints
matterRouter.get('/matters', getMatters);
matterRouter.get('/matters/:id', getMatterDetails);
matterRouter.patch('/matters/:id', updateMatter);

// Fields endpoint
matterRouter.get('/fields', getFields);

export default matterRouter;

