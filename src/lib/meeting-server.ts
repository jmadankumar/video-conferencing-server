import Websocket, { Data } from 'ws';
import { Server } from 'http';
import { MessagePayload, MessagePayloadEnum, Meeting } from '../types';
import {
  isMeetingPresent,
  deleteMeeting,
  getAllMeetingUsers,
  getMeetingUser,
  getMeetingMap,
} from './meeting-cache';
import { getMeetingId } from '../util/meeting.util';

function parseMessage(message: string): MessagePayload {
  try {
    const payload = JSON.parse(message);
    return payload;
  } catch (error) {
    return { type: MessagePayloadEnum.UNKNOWN };
  }
}

function sendMessage(socket: Websocket, payload: MessagePayload) {
  if (socket.readyState === Websocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

interface AddUserOptions {
  meetingId: string;
  userId: string;
  name: string;
}

function addUser(socket: Websocket, { meetingId, userId, name }: AddUserOptions): void {
  const meetingUsers = getAllMeetingUsers(meetingId);
  const meetingUser = getMeetingUser(meetingId, userId);
  if (meetingUser) {
    meetingUser.socket = socket;
  } else {
    meetingUsers.push({ socket, userId, joined: true, name, isAlive: true });
  }
}

function broadcastUsers(meetingId: string, socket: Websocket, payload: MessagePayload) {
  const meetingUsers = getAllMeetingUsers(meetingId);
  for (let i = 0; i < meetingUsers.length; i++) {
    const meetingUser = meetingUsers[i];
    if (meetingUser.socket !== socket) {
      sendMessage(meetingUser.socket, payload);
    }
  }
}
function terminateMeeting(meetingId: string) {
  const meetingUsers = getAllMeetingUsers(meetingId);
  for (let i = 0; i < meetingUsers.length; i++) {
    const meetingUser = meetingUsers[i];
    meetingUser.socket.terminate();
  }
  deleteMeeting(meetingId);
}

function joinMeeting(meetingId: string, socket: Websocket, payload: MessagePayload) {
  const { userId, name } = payload.data;
  console.log('User joined meeting', userId);
  if (isMeetingPresent(meetingId)) {
    addUser(socket, { meetingId, userId, name });

    sendMessage(socket, {
      type: MessagePayloadEnum.JOINED_MEETING,
      data: {
        userId,
      },
    });

    // notifiy other users
    broadcastUsers(meetingId, socket, {
      type: MessagePayloadEnum.USER_JOINED,
      data: {
        userId,
        name,
        ...payload.data,
      },
    });
  } else {
    sendMessage(socket, {
      type: MessagePayloadEnum.NOT_FOUND,
    });
  }
}
interface ConnectWithOtherUserPayloadData {
  userId: string;
  otherUserId: string;
  name: string;
  config: {
    videoEnabled: boolean;
    audioEnabled: boolean;
  };
}
function forwardConnectionRequest(meetingId: string, payload: MessagePayload) {
  const { userId, otherUserId, name } = payload.data as ConnectWithOtherUserPayloadData;
  const otherUser = getMeetingUser(meetingId, otherUserId);
  if (otherUser?.socket) {
    sendMessage(otherUser?.socket, {
      type: MessagePayloadEnum.CONNECTION_REQUEST,
      data: {
        userId,
        name,
        ...payload.data,
      },
    });
  }
}

interface OfferSdpPayload {
  userId: string;
  otherUserId: string;
  sdp: string;
}

function forwardOfferSdp(meetingId: string, payload: MessagePayload) {
  const { userId, otherUserId, sdp } = payload.data as OfferSdpPayload;
  const otherUser = getMeetingUser(meetingId, otherUserId);
  if (otherUser?.socket) {
    sendMessage(otherUser?.socket, {
      type: MessagePayloadEnum.OFFER_SDP,
      data: {
        userId,
        sdp,
      },
    });
  }
}

interface AnswerSdpPayload {
  userId: string;
  otherUserId: string;
  sdp: string;
}

function forwardAnswerSdp(meetingId: string, payload: MessagePayload) {
  const { userId, otherUserId, sdp } = payload.data as AnswerSdpPayload;
  const otherUser = getMeetingUser(meetingId, otherUserId);
  if (otherUser?.socket) {
    sendMessage(otherUser?.socket, {
      type: MessagePayloadEnum.ANSWER_SDP,
      data: {
        userId,
        sdp,
      },
    });
  }
}
interface IceCandidatePayload {
  userId: string;
  otherUserId: string;
  candidate: any;
}
function forwardIceCandidate(meetingId: string, payload: MessagePayload) {
  const { userId, otherUserId, candidate } = payload.data as IceCandidatePayload;
  const otherUser = getMeetingUser(meetingId, otherUserId);
  if (otherUser?.socket) {
    sendMessage(otherUser?.socket, {
      type: MessagePayloadEnum.ICECANDIDATE,
      data: {
        userId,
        candidate,
      },
    });
  }
}
interface UserLeftPayload {
  userId: string;
}

function userLeft(meetingId: string, socket: Websocket, payload: MessagePayload) {
  const { userId } = payload.data as UserLeftPayload;
  // notifiy other users
  broadcastUsers(meetingId, socket, {
    type: MessagePayloadEnum.USER_LEFT,
    data: {
      userId: userId,
    },
  });
}

interface MeetingEndedPayload {
  userId: string;
}

function endMeeting(meetingId: string, socket: Websocket, payload: MessagePayload) {
  const { userId } = payload.data as MeetingEndedPayload;
  // notifiy other users
  broadcastUsers(meetingId, socket, {
    type: MessagePayloadEnum.MEETING_ENDED,
    data: {
      userId,
    },
  });
  terminateMeeting(meetingId);
}
function forwardEvent(meetingId: string, socket: Websocket, payload: MessagePayload) {
  const { userId } = payload.data as MeetingEndedPayload;
  broadcastUsers(meetingId, socket, {
    type: payload.type,
    data: {
      userId,
      ...payload.data,
    },
  });
}

function handleHeartbeat(meetingId: string, socket: Websocket) {
  const meetingUsers = getAllMeetingUsers(meetingId);
  const meetingUser = meetingUsers.find((meetingUser) => meetingUser.socket === socket);
  if (meetingUser) {
    meetingUser.isAlive = true;
  }
}

function handleMessage(meetingId: string, socket: Websocket, message: Data) {
  if (typeof message === 'string') {
    const payload = parseMessage(message);
    switch (payload.type) {
      case MessagePayloadEnum.JOIN_MEETING:
        joinMeeting(meetingId, socket, payload);
        break;
      case MessagePayloadEnum.CONNECTION_REQUEST:
        forwardConnectionRequest(meetingId, payload);
        break;
      case MessagePayloadEnum.OFFER_SDP:
        forwardOfferSdp(meetingId, payload);
        break;
      case MessagePayloadEnum.ANSWER_SDP:
        forwardAnswerSdp(meetingId, payload);
        break;
      case MessagePayloadEnum.ICECANDIDATE:
        forwardIceCandidate(meetingId, payload);
        break;
      case MessagePayloadEnum.LEAVE_MEETING:
        userLeft(meetingId, socket, payload);
        break;
      case MessagePayloadEnum.END_MEETING:
        endMeeting(meetingId, socket, payload);
        break;
      case MessagePayloadEnum.VIDEO_TOGGLE:
      case MessagePayloadEnum.AUDIO_TOGGLE:
      case MessagePayloadEnum.MESSAGE:
        forwardEvent(meetingId, socket, payload);
        break;
      case MessagePayloadEnum.HEART_BEAT:
        handleHeartbeat(meetingId, socket);
        break;
      case MessagePayloadEnum.UNKNOWN:
        break;
      default:
        break;
    }
  }
}

function listenMessage(meetingId: string, socket: Websocket): void {
  if (socket.readyState === Websocket.OPEN) {
    socket.on('message', (message) => handleMessage(meetingId, socket, message));
  }
}

function endMeetingBySystem(meeting: Meeting) {
  const meetingUsers = meeting.meetingUsers;
  meetingUsers.forEach((meetingUser) => {
    sendMessage(meetingUser.socket, {
      type: MessagePayloadEnum.END_MEETING,
    });
    meetingUser.socket?.terminate();
  });
  meeting.meetingUsers = [];
  deleteMeeting(meeting.id);
}

function checkConnectionIsValid(meeting: Meeting) {
  const meetingUsers = meeting.meetingUsers;
  meetingUsers.forEach((meetingUser, index) => {
    if (meetingUser.socket.readyState === Websocket.CLOSED || !meetingUser.isAlive) {
      userLeft(meeting.id, meetingUser.socket, {
        type: MessagePayloadEnum.USER_LEFT,
        data: {
          userId: meetingUser.userId,
        },
      });
      meetingUsers.splice(index, 1);
      meetingUser.socket?.terminate();
    } else {
      meetingUser.isAlive = false;
    }
  });
}

function watchConnections() {
  const meetingMap = getMeetingMap();
  meetingMap.forEach((meeting) => {
    if (meeting.startTime + 30 * 60 * 1000 <= Date.now()) {
      endMeetingBySystem(meeting);
    } else {
      checkConnectionIsValid(meeting);
    }
  });
}

export function initMeetingServer(server: Server): void {
  const meetingServer = new Websocket.Server({
    server,
    path: '/websocket/meeting',
  });

  meetingServer.on('connection', (socket, request) => {
    const meetingId = getMeetingId(request);
    listenMessage(meetingId, socket);
  });
  setInterval(() => {
    watchConnections();
  }, 20 * 1000);
}
