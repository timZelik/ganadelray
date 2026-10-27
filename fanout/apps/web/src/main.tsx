import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ApiRequestError } from './lib/apiClient.ts';
import { createAppRouter } from './router.tsx';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (failureCount, error) => !(error instanceof ApiRequestError && error.statusCode === 401) && failureCount < 1 } },
});
const router = createAppRouter(queryClient);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
