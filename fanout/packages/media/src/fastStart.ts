import { open } from 'node:fs/promises';

const boxHeaderBytes = 8;
const extendedSizeHeaderBytes = 16;

/** Reads only top-level MP4 box headers: true when `moov` precedes `mdat`, so playback can start before the download ends. */
export async function detectFastStart(filePath: string): Promise<boolean> {
  const file = await open(filePath, 'r');
  try {
    const { size: fileSize } = await file.stat();
    const header = Buffer.alloc(extendedSizeHeaderBytes);
    for (let offset = 0; offset + boxHeaderBytes <= fileSize; ) {
      await file.read(header, 0, extendedSizeHeaderBytes, offset);
      const boxType = header.toString('latin1', 4, 8);
      if (boxType === 'moov') return true;
      if (boxType === 'mdat') return false;
      const declaredSize = header.readUInt32BE(0);
      const boxSize = declaredSize === 1 ? Number(header.readBigUInt64BE(8)) : declaredSize === 0 ? fileSize - offset : declaredSize;
      if (boxSize < boxHeaderBytes) return false;
      offset += boxSize;
    }
    return false;
  } finally {
    await file.close();
  }
}
