import { Router } from 'express';
import meetingRouter from './meeting.routes';

const router = Router();
router.use('/meeting', meetingRouter);

export default router;
