import { Meeting, MeetingUser } from '../types';
import { v4 as uuidV4 } from 'uuid';

const meetingMap = new Map<string, Meeting>();

export function getMeetingMap(): Map<string, Meeting> {
  return meetingMap;
}

export function getAllMeetingUsers(meetingId: string): MeetingUser[] {
  return meetingMap.get(meetingId)?.meetingUsers || [];
}

export function getMeetingUser(meetingId: string, userId: string): MeetingUser | null {
  const meetingUsers = getAllMeetingUsers(meetingId);
  return meetingUsers.find((meetingUser) => meetingUser.userId === userId);
}

export function isMeetingPresent(meetingId: string): boolean {
  return meetingMap.has(meetingId);
}

interface StartMeetingParams {
  name: string;
  userId: string;
}

export function startMeeting({ name, userId }: StartMeetingParams): string {
  const meetingId = uuidV4();
  const meeting: Meeting = {
    id: meetingId,
    hostId: userId,
    hostName: name,
    meetingUsers: [],
    startTime: Date.now(),
  };
  meetingMap.set(meetingId, meeting);
  console.log(meetingMap);
  return meetingId;
}

export function checkMeetingExists(meetingId: string): Omit<Meeting, 'meetingUsers'> {
  if (!meetingMap.has(meetingId)) {
    throw new Error('Meeting not found');
  }
  return meetingMap.get(meetingId) as Omit<Meeting, 'meetingUsers'>;
}

export function deleteMeeting(meetingId: string): void {
  meetingMap.delete(meetingId);
}
