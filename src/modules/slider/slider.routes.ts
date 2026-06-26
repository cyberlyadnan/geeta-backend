import { Router } from 'express';
import { sliderController } from './slider.controller.js';
import { publicCacheHeaders } from '../../middleware/cache-headers.js';

const router = Router();

router.get('/', publicCacheHeaders(60), sliderController.listPublic);

export { router as sliderRoutes };
