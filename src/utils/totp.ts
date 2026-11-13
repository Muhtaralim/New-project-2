// RFC 4648 Base32 & RFC 6238 TOTP implementation compatible with Google Authenticator

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function base32Decode(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) {
      throw new Error('Invalid Base32 character in TOTP secret');
    }
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

export function generateTotpSecret(byteLength = 20): string {
  const randomBytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(randomBytes);
  return base32Encode(randomBytes);
}

export function formatTotpSecretForDisplay(secret: string): string {
  return secret
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

export function generateRecoveryCodes(count = 6): string[] {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const buf = new Uint8Array(8);
    globalThis.crypto.getRandomValues(buf);
    let raw = '';
    for (let j = 0; j < 8; j++) {
      raw += chars[buf[j] % chars.length];
    }
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

export function buildOtpAuthUri(params: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const issuer = params.issuer || 'NeuroFactory AI';
  const account = (params.accountName || 'user@neurofactory.kz').trim();
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const search = new URLSearchParams({
    secret: params.secret.toUpperCase().replace(/\s+/g, ''),
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${search.toString()}`;
}

export function getTotpRemainingSeconds(periodSeconds = 30, timestampMs = Date.now()): number {
  const epochSec = Math.floor(timestampMs / 1000);
  const elapsed = epochSec % periodSeconds;
  return periodSeconds - elapsed;
}

export async function generateTotpCode(
  secret: string,
  timestampMs = Date.now(),
  periodSeconds = 30,
  digits = 6
): Promise<string> {
  const keyBytes = base32Decode(secret);
  const counter = Math.floor(timestampMs / 1000 / periodSeconds);

  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  view.setUint32(0, high, false);
  view.setUint32(4, low, false);

  const keyCopy = new Uint8Array(keyBytes.length);
  keyCopy.set(keyBytes);

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyCopy.buffer,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hmac = new Uint8Array(signature);

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

export async function verifyTotpCode(
  secret: string,
  inputCode: string,
  windowSteps = 1,
  timestampMs = Date.now(),
  periodSeconds = 30,
  digits = 6
): Promise<boolean> {
  const normalized = inputCode.replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }

  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const stepMs = timestampMs + offset * periodSeconds * 1000;
    const expected = await generateTotpCode(secret, stepMs, periodSeconds, digits);
    if (expected === normalized) {
      return true;
    }
  }

  return false;
}
