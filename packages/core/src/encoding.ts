import { HttpError } from "./errors";

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

// `field` names the offending input in the 400 message.
export function base64ToBytes(b64: string, field = "data"): Uint8Array {
  let bin: string;
  try {
    bin = atob(b64);
  } catch {
    throw new HttpError(400, `${field} must be valid base64`);
  }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
