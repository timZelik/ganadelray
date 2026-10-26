import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { FlaskConical } from 'lucide-react';
import { platformsQuery } from '../platforms/platformQueries.ts';
import { GettingStarted } from './GettingStarted.tsx';
import { PendingUploadCard } from './PendingUploadCard.tsx';
import { UploadPanel } from './UploadPanel.tsx';
import { usePendingUploads } from './usePendingUploads.ts';
import { VideoCard } from './VideoCard.tsx';
import { useVideos } from './videoQueries.ts';

export function VideosPage() {
  const videos = useVideos();
  const platforms = useQuery(platformsQuery);
  const pendingUploads = usePendingUploads();
  const enabledDestinations = platforms.data?.destinations.filter((destination) => destination.enabled) ?? [];
  const hasLivePlatform = enabledDestinations.some((destination) => destination.mode === 'live');
  const hasPracticePlatform = enabledDestinations.some((destination) => destination.mode === 'practice');
  const videoList = videos.data?.videos ?? [];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Your videos</h1>
        <p className="text-sm text-muted-foreground">Upload once. Fanout resizes it, writes each caption and posts it everywhere you turned on.</p>
      </div>
      {platforms.data && <GettingStarted bufferConnected={platforms.data.buffer.connected} hasLivePlatform={hasLivePlatform} hasVideos={videoList.length > 0} />}
      {hasPracticePlatform && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-4 py-3 text-sm" data-testid="practice-banner">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>Some platforms are in <strong>practice mode</strong>: Fanout prepares everything but doesn't post. <Link to="/platforms" className="font-medium underline">Connect them on Platforms</Link> to post for real.</span>
        </p>
      )}
      <UploadPanel onUpload={(file, caption, title) => void pendingUploads.start(file, caption, title)} postsForReal={hasLivePlatform} />
      <div className="space-y-3">
        {pendingUploads.uploads.map((upload) => <PendingUploadCard key={upload.localId} upload={upload} onDismiss={() => pendingUploads.dismiss(upload.localId)} />)}
        {videos.error && <p role="alert" className="text-sm text-danger">Could not load your videos: {videos.error.message}</p>}
        {videoList.map((video) => <VideoCard key={video.id} video={video} />)}
        {videos.data && videoList.length === 0 && pendingUploads.uploads.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground" data-testid="no-videos">No videos yet. Your first upload will appear here.</p>
        )}
      </div>
    </section>
  );
}
