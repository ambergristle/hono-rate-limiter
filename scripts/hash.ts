
const hash = async (script: string) => {
  const encoded = new TextEncoder().encode(script);
  const hashed = await crypto.subtle.digest('SHA-1', encoded);

  return new Uint8Array(hashed).toHex();
}