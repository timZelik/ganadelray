import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { AppShell } from './components/AppShell.tsx';
import { PublishJobsPage } from './features/publishJobs/PublishJobsPage.tsx';

const rootRoute = createRootRoute({ component: AppShell });
const publishJobsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: PublishJobsPage });

export const router = createRouter({ routeTree: rootRoute.addChildren([publishJobsRoute]) });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
