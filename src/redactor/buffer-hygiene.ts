/**
 * Secure buffer hygiene and in-memory credential sanitization utilities
 */

/**
 * Zero out in-memory Buffer or Uint8Array contents immediately
 */
export function zeroBuffer(buf: Buffer | Uint8Array | null | undefined): void {
  if (!buf) return;
  if (Buffer.isBuffer(buf)) {
    buf.fill(0);
  } else if (buf instanceof Uint8Array) {
    buf.fill(0);
  }
}

/**
 * Securely clear an array of buffers
 */
export function zeroBuffers(buffers: Array<Buffer | Uint8Array | null | undefined>): void {
  for (const b of buffers) {
    zeroBuffer(b);
  }
}
