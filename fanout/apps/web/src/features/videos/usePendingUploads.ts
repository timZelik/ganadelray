import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../lib/apiClient.ts';
import { videosKey } from './videoQueries.ts';

export type PendingUploadPhase = 'uploading' | 'processing' | 'failed';

export interface PendingUpload {
  localId: string;
  fileName: string;
  progress: number;
  phase: PendingUploadPhase;
  uploadId: string | null;
  problem: string | null;
}

const statusPollMilliseconds = 2_000;

/** Tracks uploads from the first byte until the video shows up in the list (or fails with a reason). */
export function usePendingUploads() {
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const update = useCallback((localId: string, changes: Partial<PendingUpload>) => setUploads((current) => current.map((upload) => (upload.localId === localId ? { ...upload, ...changes } : upload))), []);
  const dismiss = useCallback((localId: string) => setUploads((current) => current.filter((upload) => upload.localId !== localId)), []);

  const start = useCallback(async (file: File, caption: string, title: string) => {
    const localId = crypto.randomUUID();
    setUploads((current) => [{ localId, fileName: file.name, progress: 0, phase: 'uploading', uploadId: null, problem: null }, ...current]);
    try {
      const uploadId = await apiClient.uploadVideo({ file, caption, title, onProgress: (progress) => update(localId, { progress }) });
      update(localId, { uploadId, phase: 'processing', progress: 1 });
    } catch (error) {
      update(localId, { phase: 'failed', problem: error instanceof Error ? error.message : 'The upload failed.' });
    }
  }, [update]);

  const processingIds = uploads.filter((upload) => upload.phase === 'processing').map((upload) => `${upload.localId}:${upload.uploadId}`).join(',');
  useEffect(() => {
    if (processingIds === '') return;
    const timer = setInterval(() => {
      for (const pair of processingIds.split(',')) {
        const [localId, uploadId] = pair.split(':') as [string, string];
        void apiClient.getUploadStatus(uploadId).then(async (status) => {
          if (status.state === 'failed') update(localId, { phase: 'failed', problem: status.problem });
          if (status.state === 'done') {
            await queryClient.invalidateQueries({ queryKey: videosKey });
            dismiss(localId);
          }
        });
      }
    }, statusPollMilliseconds);
    return () => clearInterval(timer);
  }, [processingIds, update, dismiss, queryClient]);

  return { uploads, start, dismiss };
}
