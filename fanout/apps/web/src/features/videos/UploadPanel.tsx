import { Film, UploadCloud, X } from 'lucide-react';
import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import { Button } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { Field, TextArea, TextInput } from '../../components/ui/field.tsx';
import { classNames } from '../../lib/classNames.ts';

const acceptedTypes = 'video/mp4,video/quicktime,video/webm,video/x-matroska,.mp4,.mov,.m4v,.webm,.mkv';

interface UploadPanelProps {
  onUpload(file: File, caption: string, title: string): void;
  postsForReal: boolean;
}

function formatFileSize(bytes: number): string {
  return bytes >= 1_073_741_824 ? `${(bytes / 1_073_741_824).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1_048_576))} MB`;
}

/** Step 1: pick a video (drag or browse). Step 2: optional caption and title, then one button. */
export function UploadPanel({ onUpload, postsForReal }: UploadPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [title, setTitle] = useState('');
  const [isDragging, setDragging] = useState(false);

  function choose(files: FileList | null) {
    const chosen = files?.[0];
    if (chosen) setFile(chosen);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    onUpload(file, caption, title);
    setFile(null);
    setCaption('');
    setTitle('');
  }

  if (!file) {
    return (
      <button
        type="button"
        data-testid="upload-dropzone"
        onClick={() => fileInput.current?.click()}
        onDragOver={(event) => (event.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={classNames('flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors', isDragging ? 'border-info bg-info/5' : 'border-border bg-card hover:bg-muted/50')}
      >
        <UploadCloud className="size-9 text-muted-foreground" aria-hidden />
        <span className="text-base font-semibold">Drop a video here, or click to choose one</span>
        <span className="text-sm text-muted-foreground">MP4 or MOV straight from your editor or phone. Fanout makes the vertical versions.</span>
        <input ref={fileInput} type="file" accept={acceptedTypes} className="hidden" data-testid="upload-input" onChange={(event) => choose(event.target.files)} />
      </button>
    );
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <Film className="size-4 shrink-0" aria-hidden />
            <span className="truncate font-medium">{file.name}</span>
            <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
          </span>
          <Button type="button" variant="ghost" aria-label="Choose a different video" onClick={() => setFile(null)}><X className="size-4" aria-hidden /></Button>
        </div>
        <Field label="Caption" hint="Written once. Each platform gets its own hashtags and length automatically.">
          <TextArea data-testid="caption-input" placeholder="What's this video about?" value={caption} onChange={(event) => setCaption(event.target.value)} rows={3} />
        </Field>
        <Field label="Title (optional)" hint="Used where a platform asks for a title, like YouTube. Defaults to the first line of the caption.">
          <TextInput value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <div className="flex items-center justify-end gap-3">
          <span className="text-sm text-muted-foreground">{postsForReal ? 'Posts right away to the platforms you turned on.' : 'Practice mode: shows what would be posted.'}</span>
          <Button type="submit" variant="primary" size="medium" data-testid="post-button">{postsForReal ? 'Post it' : 'Try it'}</Button>
        </div>
      </form>
    </Card>
  );
}
