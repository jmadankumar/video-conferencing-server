import Websocket from 'ws';

export interface Meeting {
  id: string;
  hostId: string;
  hostName: string;
  meetingUsers: MeetingUser[];
  startTime: number;
}
export interface MeetingUser {
  socket: Websocket;
  userId: string;
  joined: boolean;
  name: string;
  isAlive: boolean;
}
export enum MessagePayloadEnum {
  JOIN_MEETING = 'join-meeting',
  JOINED_MEETING = 'joined-meeting',
  USER_JOINED = 'user-joined',
  CONNECTION_REQUEST = 'connection-request',
  INCOMING_CONNECTION_REQUEST = 'incoming-connection-request',
  OFFER_SDP = 'offer-sdp',
  ANSWER_SDP = 'answer-sdp',
  LEAVE_MEETING = 'leave-meeting',
  END_MEETING = 'end-meeting',
  USER_LEFT = 'user-left',
  MEETING_ENDED = 'meeting-ended',
  ICECANDIDATE = 'icecandidate',
  VIDEO_TOGGLE = 'video-toggle',
  AUDIO_TOGGLE = 'audio-toggle',
  MESSAGE = 'message',
  HEART_BEAT = 'heartbeat',
  NOT_FOUND = 'not-found',
  UNKNOWN = 'unknown',
}
export interface MessagePayload {
  type: MessagePayloadEnum;
  data?: any;
}
