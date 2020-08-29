import Websocket, { Data } from 'ws';
import { Server, IncomingMessage } from 'http';
import { MessagePayload, MessagePayloadEnum } from '../types';
import { isMeetingPresent, deleteMeeting, getAllMeetingUsers, getMeetingUser } from './meeting-cache';

function parseMessage(message: string): MessagePayload {
    try {
        const payload = JSON.parse(message);
        return payload;
    } catch (error) {
        return { type: MessagePayloadEnum.UNKNOWN };
    }
}

function sendMessage(socket: Websocket, payload: MessagePayload) {
    socket.send(JSON.stringify(payload));
}

function getMeetingId(request: IncomingMessage) {
    const {
        url,
        headers: { host },
    } = request;
    const urlObj = new URL(url, `http://${host}`);
    return urlObj.searchParams.get('id');
}

interface AddUserOptions {
    meetingId: string;
    userId: string;
    name: string;
}

function addUser(socket: Websocket, { meetingId, userId, name }: AddUserOptions): void {
    if (isMeetingPresent(meetingId)) {
        const meetingUsers = getAllMeetingUsers(meetingId);
        const meetingUser = getMeetingUser(meetingId, userId);
        if (meetingUser) {
            meetingUser.socket = socket;
        } else {
            meetingUsers.push({ socket, userId, joined: true, name });
        }
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
function forwardConnectionRequest(meetingId: string, socket: Websocket, payload: MessagePayload) {
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

function forwardOfferSdp(meetingId: string, socket: Websocket, payload: MessagePayload) {
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

function forwardAnswerSdp(meetingId: string, socket: Websocket, payload: MessagePayload) {
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
function forwardIceCandidate(meetingId: string, socket: Websocket, payload: MessagePayload) {
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
function handleMessage(meetingId: string, socket: Websocket, message: Data) {
    if (typeof message === 'string') {
        const payload = parseMessage(message);
        switch (payload.type) {
            case MessagePayloadEnum.JOIN_MEETING:
                joinMeeting(meetingId, socket, payload);
                break;
            case MessagePayloadEnum.CONNECTION_REQUEST:
                forwardConnectionRequest(meetingId, socket, payload);
                break;
            case MessagePayloadEnum.OFFER_SDP:
                forwardOfferSdp(meetingId, socket, payload);
                break;
            case MessagePayloadEnum.ANSWER_SDP:
                forwardAnswerSdp(meetingId, socket, payload);
                break;
            case MessagePayloadEnum.ICECANDIDATE:
                forwardIceCandidate(meetingId, socket, payload);
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

export function initMeetingServer(server: Server): void {
    const meetingServer = new Websocket.Server({
        server,
        path: '/websocket/meeting',
    });

    meetingServer.on('connection', (socket, request) => {
        const meetingId = getMeetingId(request);
        listenMessage(meetingId, socket);
    });
}
