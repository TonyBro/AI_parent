import { base64ToBytes, bytesToBase64 } from "./base64";

const AES_GCM_IV_BYTES = 12;

function randomIv(): Uint8Array<ArrayBuffer> {
  const iv = new Uint8Array(AES_GCM_IV_BYTES) as Uint8Array<ArrayBuffer>;
  crypto.getRandomValues(iv);
  return iv;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importAesKey(raw: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toArrayBuffer(raw), { name: "AES-GCM" }, false, usage);
}

export async function wrapDekWithKek(params: {
  dekRaw: Uint8Array;
  kekBase64: string;
}): Promise<{ dekWrappedB64: string; dekWrapIvB64: string }> {
  const kekRaw = base64ToBytes(params.kekBase64);
  const kek = await importAesKey(kekRaw, ["encrypt"]);
  const iv = randomIv();

  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, kek, toArrayBuffer(params.dekRaw)),
  );
  return { dekWrappedB64: bytesToBase64(wrapped), dekWrapIvB64: bytesToBase64(iv) };
}

export async function unwrapDekWithKek(params: {
  dekWrappedB64: string;
  dekWrapIvB64: string;
  kekBase64: string;
}): Promise<Uint8Array> {
  const kekRaw = base64ToBytes(params.kekBase64);
  const kek = await importAesKey(kekRaw, ["decrypt"]);
  const iv = base64ToBytes(params.dekWrapIvB64);
  const wrapped = base64ToBytes(params.dekWrappedB64);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, kek, toArrayBuffer(wrapped)),
  );
}

export async function encryptWithDek(params: {
  dekRaw: Uint8Array;
  plaintext: string;
}): Promise<{ ciphertextB64: string; ivB64: string }> {
  const dek = await importAesKey(params.dekRaw, ["encrypt"]);
  const iv = randomIv();
  const pt = new TextEncoder().encode(params.plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, dek, toArrayBuffer(pt)));
  return { ciphertextB64: bytesToBase64(ct), ivB64: bytesToBase64(iv) };
}

export async function decryptWithDek(params: {
  dekRaw: Uint8Array;
  ciphertextB64: string;
  ivB64: string;
}): Promise<string> {
  const dek = await importAesKey(params.dekRaw, ["decrypt"]);
  const iv = base64ToBytes(params.ivB64);
  const ct = base64ToBytes(params.ciphertextB64);
  const pt = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, dek, toArrayBuffer(ct)),
  );
  return new TextDecoder().decode(pt);
}


