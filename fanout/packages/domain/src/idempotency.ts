/** One publish per (source item, destination), no matter how many times fan-out runs. Web Crypto keeps this browser-safe. */
export async function createPublishJobIdempotencyKey(sourceItemId: string, workflowDestinationId: string): Promise<string> {
  const keyMaterial = new TextEncoder().encode(`${sourceItemId}\u0000${workflowDestinationId}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', keyMaterial);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
