/** Every URL the dashboard calls, defined once for the server and the client. */
export const apiRoutes = {
  health: '/api/health',
  session: '/api/session',
  publishJobs: '/api/publish-jobs',
  publishJob: (publishJobId: string) => `/api/publish-jobs/${publishJobId}`,
  retryPublishJob: (publishJobId: string) => `/api/publish-jobs/${publishJobId}/retry`,
  videos: '/api/videos',
  videoThumbnail: (videoId: string) => `/api/videos/${videoId}/thumbnail`,
  uploadStatus: (uploadId: string) => `/api/uploads/${uploadId}`,
  platforms: '/api/platforms',
  bufferConnection: '/api/platforms/buffer',
  destination: (destinationId: string) => `/api/platforms/destinations/${destinationId}`,
  fitMode: '/api/platforms/fit',
} as const;

export const apiRoutePatterns = {
  publishJob: '/api/publish-jobs/:publishJobId',
  retryPublishJob: '/api/publish-jobs/:publishJobId/retry',
  videoThumbnail: '/api/videos/:videoId/thumbnail',
  uploadStatus: '/api/uploads/:uploadId',
  destination: '/api/platforms/destinations/:destinationId',
} as const;

export const bullBoardBasePath = '/admin/queues';
export const authenticationBasePath = '/api/auth';
