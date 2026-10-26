import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';

/** Bridges the DOM ReadableStream type (fetch, connectors) and Node streams (fs, AWS SDK). */
export function toNodeReadable(stream: ReadableStream<Uint8Array>): Readable {
  return Readable.fromWeb(stream as NodeWebReadableStream<Uint8Array>);
}

export function toWebReadableStream(readable: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(readable) as ReadableStream<Uint8Array>;
}
