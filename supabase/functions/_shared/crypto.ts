// Envelope encryption for .rdbak backup files.
//
// A random 256-bit data key encrypts the (gzip-compressed) JSON payload
// with AES-256-GCM; the data key itself is wrapped with a server-held
// master key (BACKUP_MASTER_KEY secret, never sent to the client) using
// AES-256-GCM. The envelope — wrapped key + payload ciphertext, each with
// their own IV — is the entire .rdbak file content. No external zip
// library is needed: gzip comes from the platform's built-in
// CompressionStream/DecompressionStream.

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function importMasterKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("BACKUP_MASTER_KEY");
  if (!raw) throw new Error("BACKUP_MASTER_KEY is not configured");
  const keyBytes = b64decode(raw);
  if (keyBytes.length !== 32) {
    throw new Error("BACKUP_MASTER_KEY must decode to exactly 32 bytes (base64 of a 256-bit key)");
  }
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return concat(chunks);
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return concat(chunks);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface BackupEnvelope {
  rdbak_version: 1;
  wrapped_key_iv: string;
  wrapped_key: string;
  payload_iv: string;
  payload_ciphertext: string;
  checksum_sha256: string;
}

export async function encryptPayload(payload: unknown): Promise<{ envelope: BackupEnvelope; sizeBytes: number }> {
  const masterKey = await importMasterKey();

  const json = new TextEncoder().encode(JSON.stringify(payload));
  const compressed = await gzip(json);

  const dataKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const dataKey = await crypto.subtle.importKey("raw", dataKeyBytes, "AES-GCM", false, ["encrypt"]);

  const payloadIv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: payloadIv }, dataKey, compressed),
  );

  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const wrappedKey = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv }, masterKey, dataKeyBytes),
  );

  const envelope: BackupEnvelope = {
    rdbak_version: 1,
    wrapped_key_iv: b64encode(wrapIv),
    wrapped_key: b64encode(wrappedKey),
    payload_iv: b64encode(payloadIv),
    payload_ciphertext: b64encode(ciphertext),
    checksum_sha256: await sha256Hex(ciphertext),
  };

  return { envelope, sizeBytes: JSON.stringify(envelope).length };
}

export async function decryptPayload(envelope: BackupEnvelope): Promise<unknown> {
  if (!envelope || envelope.rdbak_version !== 1) {
    throw new Error("unrecognized or corrupt backup file");
  }
  const masterKey = await importMasterKey();

  const wrapIv = b64decode(envelope.wrapped_key_iv);
  const wrappedKey = b64decode(envelope.wrapped_key);
  const payloadIv = b64decode(envelope.payload_iv);
  const ciphertext = b64decode(envelope.payload_ciphertext);

  const actualChecksum = await sha256Hex(ciphertext);
  if (actualChecksum !== envelope.checksum_sha256) {
    throw new Error("backup file failed checksum verification — it may be corrupt or tampered with");
  }

  let dataKeyBytes: Uint8Array;
  try {
    dataKeyBytes = new Uint8Array(
      await crypto.subtle.decrypt({ name: "AES-GCM", iv: wrapIv }, masterKey, wrappedKey),
    );
  } catch {
    throw new Error("backup file could not be decrypted (wrong key or corrupt envelope)");
  }
  const dataKey = await crypto.subtle.importKey("raw", dataKeyBytes, "AES-GCM", false, ["decrypt"]);

  let compressed: Uint8Array;
  try {
    compressed = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: payloadIv }, dataKey, ciphertext));
  } catch {
    throw new Error("backup file could not be decrypted (wrong key or corrupt envelope)");
  }

  const json = await gunzip(compressed);
  return JSON.parse(new TextDecoder().decode(json));
}
