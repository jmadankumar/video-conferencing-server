import { Router } from 'express';
import { startMeeting, checkMeetingExists } from '../lib/meeting-cache';

const router = Router();
interface StartMeetingRequestBody {
  [key: string]: string;
}
interface StartMeetingResponseBody {
  [meetingId: string]: string;
}
router.post<null, StartMeetingResponseBody, StartMeetingRequestBody>('/start', (req, res) => {
  const { name, userId } = req.body;
  const meetingId = startMeeting({ name, userId });
  res.send({ meetingId });
});

router.get('/join', (req, res) => {
  const { meetingId } = req.query;
  try {
    const meeting = checkMeetingExists(meetingId as string);
    res.status(200).send(meeting);
  } catch (error) {
    res.status(404).send({ message: 'Meeting not found' });
  }
});

export default router;
