import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from './components/AppShell.tsx';
import { PlatformsPage } from './features/platforms/PlatformsPage.tsx';
import { PublishJobsPage } from './features/publishJobs/PublishJobsPage.tsx';
import { LoginPage } from './features/session/LoginPage.tsx';
import { sessionQuery } from './features/session/sessionQueries.ts';
import { VideosPage } from './features/videos/VideosPage.tsx';
import { ApiRequestError } from './lib/apiClient.ts';

interface RouterContext {
  queryClient: QueryClient;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Outlet });

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: (search: Record<string, unknown>): { next?: string } => (typeof search.next === 'string' ? { next: search.next } : {}),
  component: LoginPage,
});

/** Every page inside the app requires a session; without one, go to login and come back afterwards. */
const signedInRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'signed-in',
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData(sessionQuery);
    } catch (error) {
      if (error instanceof ApiRequestError && error.statusCode === 401) throw redirect({ to: '/login', search: { next: location.href } });
      throw error;
    }
  },
  component: AppShell,
});

const videosRoute = createRoute({ getParentRoute: () => signedInRoute, path: '/', component: VideosPage });
const platformsRoute = createRoute({ getParentRoute: () => signedInRoute, path: '/platforms', component: PlatformsPage });
const activityRoute = createRoute({ getParentRoute: () => signedInRoute, path: '/activity', component: PublishJobsPage });

const routeTree = rootRoute.addChildren([loginRoute, signedInRoute.addChildren([videosRoute, platformsRoute, activityRoute])]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({ routeTree, context: { queryClient } });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
