// Test stand-in for lib/push.ts (used when TEST_STUB_PUSH=1): records pushes
// instead of sending them. Everything else comes from the real file.
import type { PushMessage, PushResult } from "../../lib/push";
export * from "../../lib/push";

export const sentPushes: { userId: string; msg: PushMessage }[] = [];
(globalThis as { __sentPushes?: typeof sentPushes }).__sentPushes = sentPushes;

export async function sendPush(userId: string, msg: PushMessage): Promise<PushResult> {
  sentPushes.push({ userId, msg });
  return { sent: 1 };
}
