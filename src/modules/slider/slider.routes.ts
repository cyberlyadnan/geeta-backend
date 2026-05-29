import { Router } from 'express';
import { sliderController } from './slider.controller.js';

const router = Router();

router.get('/', sliderController.listPublic);

export { router as sliderRoutes };
