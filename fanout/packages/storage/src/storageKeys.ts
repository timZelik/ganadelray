const masterPrefix = 'masters/';
const renditionPrefix = 'renditions/';

/** One place that decides object layout; masters and renditions live under separate prefixes with separate retention. */
export const storageKeys = {
  master: (sourceConnectionId: string, checksum: string, extension: string) => `${masterPrefix}${sourceConnectionId}/${checksum}${extension}`,
  rendition: (sourceItemId: string, renderFingerprint: string) => `${renditionPrefix}${sourceItemId}/${renderFingerprint}.mp4`,
  isMaster: (key: string) => key.startsWith(masterPrefix),
};
