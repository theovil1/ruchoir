/**
 * Account-security model for the personal preferences dialog.
 *
 * This is the L5a UI exploration: there is no backend, so two-factor state, passkeys and recovery
 * codes are all mock. Values are derived deterministically (no `Math.random`, which the static export
 * forbids at build time) from a small counter seed carried in the persisted settings, so regenerating
 * the recovery codes yields a fresh, stable set each time without any randomness source.
 */

/** A registered WebAuthn credential (passkey), as shown in the security list. */
export type Passkey = {
  id: string;
  /** Human label the user gave the key, e.g. "MacBook (Touch ID)". */
  name: string;
  /** Human "added on" date carried as a pre-formatted string (mock data, no live clock). */
  added: string;
};

/** Personal account-security state, persisted alongside the rest of the settings. */
export type AccountSecurity = {
  /** Whether time-based one-time-password (TOTP) two-factor is enabled. */
  totpEnabled: boolean;
  /** Registered passkeys. */
  passkeys: Passkey[];
  /** How many single-use recovery codes remain unused (mock: reset to 10 on each regeneration). */
  recoveryRemaining: number;
  /** Seed bumped on every recovery-code regeneration so the generated set changes deterministically. */
  recoverySeed: number;
};

export const DEFAULT_ACCOUNT_SECURITY: AccountSecurity = {
  totpEnabled: false,
  passkeys: [{ id: "pk-1", name: "Clé de cet appareil", added: "12 août 2026" }],
  recoveryRemaining: 10,
  recoverySeed: 1,
};

/**
 * Fixed base32 TOTP secret for the setup demo. A real deployment would mint a per-user secret on the
 * server; here a stable value keeps the QR and the manual key consistent across renders.
 */
export const MOCK_TOTP_SECRET = "JBSWY3DPEHPK3PXPHZ2Q";

/** Group the secret into 4-character blocks for readable manual entry, e.g. "JBSW Y3DP EHPK …". */
export function groupSecret(secret: string): string {
  return (secret.match(/.{1,4}/g) ?? [secret]).join(" ");
}

/** Build the `otpauth://` URI an authenticator app reads from the QR code. */
export function otpauthUri(secret: string, account: string, issuer = "Ruchoir"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Deterministic 32-bit LCG. Seeded so the same seed always yields the same stream (no randomness). */
function lcg(seed: number): () => number {
  let s = (seed * 2654435761 + 1) >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s;
  };
}

// Unambiguous alphabet: no 0/O/1/l/i to keep hand-copied codes readable.
const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * Generate ten single-use recovery codes, formatted as three groups of four (e.g. "a2cd-9fkm-pq34").
 * Deterministic in `seed`, so a given seed reproduces the same set: bump the seed to rotate them.
 */
export function generateRecoveryCodes(seed: number): string[] {
  const next = lcg(seed + 7);
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const groups: string[] = [];
    for (let g = 0; g < 3; g++) {
      let chunk = "";
      for (let c = 0; c < 4; c++) chunk += CODE_ALPHABET[next() % CODE_ALPHABET.length];
      groups.push(chunk);
    }
    codes.push(groups.join("-"));
  }
  return codes;
}

/**
 * Build a decorative QR module matrix for the given payload. This is a representative render for the
 * UI exploration (it does not encode a scannable QR): the three finder patterns are placed at the
 * corners and the data area is filled deterministically from a hash of the payload, so it reads
 * unmistakably as a QR code while staying dependency-free.
 */
export function qrMatrix(value: string, size = 25): boolean[][] {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const next = lcg(h);
  const grid: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  const inFinder = (r: number, c: number) => {
    const zones = [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ];
    return zones.some(([r0, c0]) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7);
  };
  const stampFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        grid[r0 + r][c0 + c] = ring || core;
      }
    }
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (inFinder(r, c)) continue;
      grid[r][c] = next() % 100 < 46;
    }
  }
  stampFinder(0, 0);
  stampFinder(0, size - 7);
  stampFinder(size - 7, 0);
  return grid;
}
