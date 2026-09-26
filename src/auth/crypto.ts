const PBKDF2_ITERATIONS = 100_000;

export function randomToken(bytes = 32): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export function generateSalt(): string {
  return randomToken(16);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function hashPassword(
  password: string,
  salt: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  // Workers' Web Crypto implementation supports up to 100,000 PBKDF2 iterations.
  const digest = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function timingSafeStringCompare(
  a: string,
  b: string,
): Promise<boolean> {
  const [first, second] = await Promise.all([sha256(a), sha256(b)]);
  let mismatch = 0;
  for (let index = 0; index < first.length; index++)
    mismatch |= first.charCodeAt(index) ^ second.charCodeAt(index);
  return mismatch === 0;
}
