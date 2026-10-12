/**
 * messaging.ts — typed union cho message giữa extension pages (side panel,
 * popup) và content script (docs/050-Research/21 §5.5). M0 chỉ có ping/pong để
 * kiểm tra đường ống panel ↔ content script; broker đầy đủ làm ở M2.
 */

export type PingMessage = { kind: 'ping' };

export type PongMessage = { kind: 'pong' };

export type ContentMessage = PingMessage;

export function isPingMessage(value: unknown): value is PingMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'ping'
  );
}

export function isPongMessage(value: unknown): value is PongMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'pong'
  );
}
