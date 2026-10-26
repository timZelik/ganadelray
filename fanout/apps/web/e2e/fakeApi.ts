import type { DestinationSettingsView, PlatformsResponse, PostView, PublishJobView, VideoView } from '@fanout/api-contract';
import type { Page, Route } from '@playwright/test';

export function buildJob(overrides: Partial<PublishJobView>): PublishJobView {
  return {
    id: crypto.randomUUID(), status: 'published', dryRun: true, attemptCount: 1, destinationKind: 'instagram_reels', publisherRoute: 'console',
    workflowName: 'My platforms', sourceItemTitle: 'morning routine', sourceItemExternalId: 'upload-1', scheduledFor: null,
    publishedAt: new Date().toISOString(), externalPostId: null, externalPostUrl: null, lastError: null, lastErrorKind: null,
    requestPreview: { destination: 'instagram_reels', caption: 'Morning routine #reels' }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), canRetry: false,
    ...overrides,
  };
}

export function buildPost(overrides: Partial<PostView>): PostView {
  return { publishJobId: crypto.randomUUID(), destinationKind: 'tiktok', state: 'posted', problem: null, postUrl: null, canRetry: false, updatedAt: new Date().toISOString(), ...overrides };
}

export function buildVideo(overrides: Partial<VideoView>): VideoView {
  return { id: crypto.randomUUID(), title: 'Studio tour', caption: 'Inside the studio', durationSeconds: 8, createdAt: new Date().toISOString(), thumbnailUrl: null, posts: [], ...overrides };
}

function buildDestination(destinationKind: DestinationSettingsView['destinationKind']): DestinationSettingsView {
  return { id: crypto.randomUUID(), destinationKind, enabled: true, channelId: null, captionTemplate: '{{originalCaption}}\n\n{{hashtags}}', hashtags: [], channelOptions: [], mode: 'practice' };
}

export interface FakeApiState {
  signedIn: boolean;
  jobs: PublishJobView[];
  videos: VideoView[];
  platforms: PlatformsResponse;
  uploadOutcome: { state: 'done' | 'failed'; problem: string | null };
  requests: string[];
}

export function initialState(overrides: Partial<FakeApiState> = {}): FakeApiState {
  return {
    signedIn: true,
    jobs: [],
    videos: [],
    uploadOutcome: { state: 'done', problem: null },
    requests: [],
    platforms: {
      buffer: { connected: false, needsReconnect: false, organizationName: null, channels: [] },
      livePostingEnabled: true,
      fitMode: 'crop',
      destinations: [buildDestination('instagram_reels'), buildDestination('tiktok'), buildDestination('youtube_shorts'), buildDestination('linkedin')],
    },
    ...overrides,
  };
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, json: body });

/** A stateful stand-in for the API, so the dashboard can be driven end to end without the backend. */
export async function installFakeApi(page: Page, state: FakeApiState = initialState()): Promise<FakeApiState> {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    state.requests.push(`${request.method()} ${path}`);
    if (path.startsWith('/api/auth/sign-in')) {
      const { password } = request.postDataJSON() as { password: string };
      if (password !== 'correct-password') return json(route, { message: 'Invalid email or password', code: 'INVALID_EMAIL_OR_PASSWORD' }, 401);
      state.signedIn = true;
      return json(route, { user: { id: 'user-1', email: 'gana@example.com', name: 'Gana' } });
    }
    if (path.startsWith('/api/auth/sign-out')) return (state.signedIn = false), json(route, { success: true });
    if (path === '/api/health') return json(route, { status: 'ok', dryRun: false });
    if (!state.signedIn) return json(route, { error: 'Please log in' }, 401);
    if (path === '/api/session') return json(route, { user: { name: 'Gana', email: 'gana@example.com' } });
    if (path === '/api/publish-jobs') {
      const status = new URL(request.url()).searchParams.get('status');
      return json(route, { jobs: state.jobs.filter((job) => !status || job.status === status) });
    }
    if (path.endsWith('/retry')) {
      const jobId = path.split('/').at(-2)!;
      const job = state.jobs.find((candidate) => candidate.id === jobId);
      if (job) Object.assign(job, { status: 'queued', lastError: null, canRetry: false });
      for (const video of state.videos) for (const post of video.posts) if (post.publishJobId === jobId) Object.assign(post, { state: 'waiting', problem: null, canRetry: false });
      return json(route, { job: job ?? buildJob({ id: jobId, status: 'queued' }) });
    }
    if (path === '/api/videos' && request.method() === 'GET') return json(route, { videos: state.videos });
    if (path === '/api/videos' && request.method() === 'POST') return json(route, { uploadId: '11111111-1111-4111-8111-111111111111' }, 202);
    if (path.startsWith('/api/uploads/')) {
      if (state.uploadOutcome.state === 'done' && !state.videos.some((video) => video.title === 'my first upload')) {
        state.videos.unshift(buildVideo({ title: 'my first upload', posts: state.platforms.destinations.filter((destination) => destination.enabled).map((destination) => buildPost({ destinationKind: destination.destinationKind, state: destination.mode === 'live' ? 'posted' : 'practice' })) }));
      }
      return json(route, { ...state.uploadOutcome, videoId: state.uploadOutcome.state === 'done' ? state.videos[0]!.id : null });
    }
    if (path === '/api/platforms') return json(route, state.platforms);
    if (path === '/api/platforms/buffer' && request.method() === 'PUT') {
      const { apiKey } = request.postDataJSON() as { apiKey: string };
      if (apiKey !== 'valid-buffer-key') return json(route, { error: 'Buffer did not accept that API key. Copy it again from Buffer → Settings → API.' }, 400);
      const channels = [{ id: 'channel-tiktok', name: 'Gana', service: 'tiktok', avatar: null }];
      state.platforms.buffer = { connected: true, needsReconnect: false, organizationName: 'Gana Studio', channels };
      for (const destination of state.platforms.destinations) {
        if (destination.destinationKind === 'tiktok') Object.assign(destination, { channelId: 'channel-tiktok', channelOptions: channels, mode: 'live' });
      }
      return json(route, state.platforms);
    }
    if (path.startsWith('/api/platforms/destinations/')) {
      const destination = state.platforms.destinations.find((candidate) => candidate.id === path.split('/').at(-1))!;
      const changes = request.postDataJSON() as Partial<DestinationSettingsView>;
      if (changes.captionTemplate?.includes('{{orignal')) return json(route, { error: 'Unknown placeholder {{orignalCaption}}' }, 400);
      Object.assign(destination, changes);
      return json(route, state.platforms);
    }
    if (path === '/api/platforms/fit') return (state.platforms.fitMode = (request.postDataJSON() as { fitMode: 'pad' | 'crop' }).fitMode), json(route, state.platforms);
    return json(route, { error: `Unhandled fake route ${path}` }, 500);
  });
  return state;
}
