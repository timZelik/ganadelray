/** Every URL the dashboard calls, defined once for the server and the client. */
export const apiRoutes = {
  health: '/api/health',
  publishJobs: '/api/publish-jobs',
  publishJob: (publishJobId: string) => `/api/publish-jobs/${publishJobId}`,
  retryPublishJob: (publishJobId: string) => `/api/publish-jobs/${publishJobId}/retry`,
} as const;

export const apiRoutePatterns = {
  publishJob: '/api/publish-jobs/:publishJobId',
  retryPublishJob: '/api/publish-jobs/:publishJobId/retry',
} as const;

export const bullBoardBasePath = '/admin/queues';
