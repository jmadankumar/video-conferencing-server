import { IncomingMessage } from 'http';

export function getMeetingId(request: IncomingMessage): string {
  const {
    url,
    headers: { host },
  } = request;
  const urlObj = new URL(url, `http://${host}`);
  return urlObj.searchParams.get('id');
}
