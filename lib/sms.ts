import "server-only";

// OPTIONAL real-SMS adapter. OFF by default and not wired to any agent yet.
//
// Real SMS from a server is not free in Australia: every provider charges per
// message, and Australian sender IDs / numbers now need registration. The free
// way to get the weekly hours as a text is the iPhone Shortcut automation
// (Settings → iPhone & Siri), which texts yourself from your own phone.
//
// Before anyone turns this on, the rest of the safety rules must be built:
// the phone number stored encrypted (lib/crypto.ts), verified with a one-time
// code, texts only to that verified number, 1 message per week by default and
// a hard monthly cap, never sent to an AI or written to logs, removable any time.
// Until then smsEnabled() stays false even if the env vars are set.

export type SmsProvider = {
  name: string;
  send: (to: string, body: string) => Promise<void>;
};

const VERIFICATION_BUILT = false;

export function smsEnabled(): boolean {
  return VERIFICATION_BUILT && process.env.SMS_ENABLED === "1" && !!process.env.SMS_PROVIDER;
}

export function smsProvider(): SmsProvider | null {
  if (!smsEnabled()) return null;
  // Add a provider here (e.g. one reading SMS_API_KEY) once one has been chosen.
  return null;
}
