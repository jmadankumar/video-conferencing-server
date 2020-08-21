import Websocket, { Data } from 'ws';
import { Server, IncomingMessage } from 'http';
import { v4 as uuidV4 } from 'uuid';

interface Meeting {
    id: string;
    hostId: string;
    hostName: string;
    meetingUsers: MeetingUser[];
}
const meetingMap = new Map<string, Meeting>();

interface MeetingUser {
    socket: Websocket;
    userId: string;
    joined: boolean;
    name: string;
}

interface MessagePayload {
    type:
        | 'join-meeting'
        | 'joined-meeting'
        | 'user-joined'
        | 'connection-request'
        | 'incoming-connection-request'
        | 'offer-sdp'
        | 'answer-sdp'
        | 'leave-meeting'
        | 'end-meeting'
        | 'user-left'
        | 'meeting-ended'
        | 'icecandidate'
        | 'video-toggle'
        | 'audio-toggle'
        | 'message'
        | 'unknown';
    data?: any;
}

function parseMessage(message: string): MessagePayload {
    try {
        const payload = JSON.parse(message);
        return payload;
    } catch (error) {
        return { type: 'unknown' };
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
function getMeetingUsers(meetingId: string): MeetingUser[] {
    return meetingMap.get(meetingId)?.meetingUsers || [];
}
function getMeetingUser(meetingId: string, userId: string): MeetingUser | null {
    const meetingUsers = getMeetingUsers(meetingId);
    return meetingUsers.find((meetingUser) => meetingUser.userId === userId);
}
interface AddUserOptions {
    meetingId: string;
    userId: string;
    name: string;
}
function addUser(socket: Websocket, { meetingId, userId, name }: AddUserOptions): void {
    if (meetingMap.has(meetingId)) {
        const meetingUsers = getMeetingUsers(meetingId);
        const meetingUser = getMeetingUser(meetingId, userId);
        if (meetingUser) {
            meetingUser.socket = socket;
        } else {
            meetingUsers.push({ socket, userId, joined: true, name });
        }
    }
}

function broadcastUsers(meetingId: string, socket: Websocket, payload: MessagePayload) {
    const meetingUsers = getMeetingUsers(meetingId);
    for (let i = 0; i < meetingUsers.length; i++) {
        const meetingUser = meetingUsers[i];
        if (meetingUser.socket !== socket) {
            sendMessage(meetingUser.socket, payload);
        }
    }
}
function terminateMeeting(meetingId: string) {
    const meetingUsers = getMeetingUsers(meetingId);
    for (let i = 0; i < meetingUsers.length; i++) {
        const meetingUser = meetingUsers[i];
        meetingUser.socket.terminate();
    }
    meetingMap.delete(meetingId);
}

function joinMeeting(meetingId: string, socket: Websocket, payload: MessagePayload) {
    const { userId, name } = payload.data;
    console.log('User joined meeting', userId);

    addUser(socket, { meetingId, userId, name });

    sendMessage(socket, {
        type: 'joined-meeting',
        data: {
            userId,
        },
    });

    // notifiy other users
    broadcastUsers(meetingId, socket, {
        type: 'user-joined',
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
            type: 'connection-request',
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
            type: 'offer-sdp',
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
            type: 'answer-sdp',
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
            type: 'icecandidate',
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
        type: 'user-left',
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
        type: 'meeting-ended',
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
            case 'join-meeting':
                joinMeeting(meetingId, socket, payload);
                break;
            case 'connection-request':
                forwardConnectionRequest(meetingId, socket, payload);
                break;
            case 'offer-sdp':
                forwardOfferSdp(meetingId, socket, payload);
                break;
            case 'answer-sdp':
                forwardAnswerSdp(meetingId, socket, payload);
                break;
            case 'icecandidate':
                forwardIceCandidate(meetingId, socket, payload);
                break;
            case 'leave-meeting':
                userLeft(meetingId, socket, payload);
                break;
            case 'end-meeting':
                endMeeting(meetingId, socket, payload);
                break;
            case 'video-toggle':
            case 'audio-toggle':
            case 'message':
                forwardEvent(meetingId, socket, payload);
                break;
            case 'unknown':
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
interface StartMeetingParams {
    name: string;
    userId: string;
}
export function startMeeting({ name, userId }: StartMeetingParams): string {
    const meetingId = uuidV4();
    const meeting: Meeting = { id: meetingId, hostId: userId, hostName: name, meetingUsers: [] };
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
