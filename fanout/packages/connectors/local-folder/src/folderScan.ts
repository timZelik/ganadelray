import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, relative, sep } from 'node:path';

export const videoExtensions = new Set(['.mp4', '.mov', '.m4v', '.webm', '.mkv']);

export interface HubFile {
  absolutePath: string;
  relativePath: string;
  sizeBytes: number;
  modifiedMilliseconds: number;
  /** max(mtime, ctime): a file moved into the hub keeps its old mtime but gets a fresh ctime. */
  arrivedMilliseconds: number;
}

function isHidden(relativePath: string): boolean {
  return relativePath.split(sep).some((segment) => segment.startsWith('.'));
}

function isVideo(fileName: string): boolean {
  return videoExtensions.has(extname(fileName).toLowerCase());
}

export async function scanHubFolder(directory: string): Promise<HubFile[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const videoPaths = entries
    .filter((entry) => entry.isFile() && isVideo(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((absolutePath) => !isHidden(relative(directory, absolutePath)));
  return Promise.all(
    videoPaths.map(async (absolutePath) => {
      const fileStats = await stat(absolutePath);
      return {
        absolutePath,
        relativePath: relative(directory, absolutePath),
        sizeBytes: fileStats.size,
        modifiedMilliseconds: Math.floor(fileStats.mtimeMs),
        arrivedMilliseconds: Math.floor(Math.max(fileStats.mtimeMs, fileStats.ctimeMs)),
      };
    }),
  );
}

/** Same name, size and mtime ⇒ same item; re-exporting a video under the same name yields a new one. */
export function externalIdFor(file: HubFile): string {
  return `${file.relativePath}@${file.sizeBytes}-${file.modifiedMilliseconds}`;
}

export function titleFor(file: HubFile): string {
  return basename(file.relativePath, extname(file.relativePath)).replace(/[-_]+/g, ' ').trim();
}

/** An optional `clip.txt` beside `clip.mp4` supplies the caption. */
export async function readSidecarCaption(file: HubFile): Promise<string | null> {
  const sidecarPath = file.absolutePath.slice(0, -extname(file.absolutePath).length) + '.txt';
  try {
    const caption = (await readFile(sidecarPath, 'utf8')).trim();
    return caption === '' ? null : caption;
  } catch {
    return null;
  }
}
