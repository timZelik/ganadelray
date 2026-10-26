import { AlertCircle, Loader2, X } from 'lucide-react';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import type { PendingUpload } from './usePendingUploads.ts';

export function PendingUploadCard({ upload, onDismiss }: { upload: PendingUpload; onDismiss(): void }) {
  const percent = Math.round(upload.progress * 100);
  return (
    <Card className="flex items-center gap-4 p-4" data-testid="pending-upload">
      {upload.phase === 'failed' ? <AlertCircle className="size-5 shrink-0 text-danger" aria-hidden /> : <Loader2 className="size-5 shrink-0 animate-spin text-info" aria-hidden />}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-sm font-medium">{upload.fileName}</p>
        {upload.phase === 'uploading' && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-info transition-all" style={{ width: `${percent}%` }} /></div>
            <span className="text-xs tabular-nums text-muted-foreground">Uploading {percent}%</span>
          </div>
        )}
        {upload.phase === 'processing' && <p className="text-sm text-muted-foreground">Uploaded. Preparing a version for each platform…</p>}
        {upload.phase === 'failed' && <p className="text-sm text-danger" role="alert">{upload.problem ?? 'Something went wrong.'}</p>}
      </div>
      {upload.phase === 'failed' && <Button variant="ghost" aria-label="Dismiss" onClick={onDismiss}><X className="size-4" aria-hidden /></Button>}
    </Card>
  );
}
