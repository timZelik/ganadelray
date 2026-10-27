import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient.ts';
import { authClient } from './authClient.ts';

export const sessionQuery = queryOptions({ queryKey: ['session'], queryFn: apiClient.getSession, staleTime: 5 * 60_000, retry: false });

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) throw new Error(error.status === 401 ? 'That email and password do not match.' : (error.message ?? 'Could not log in. Please try again.'));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey }),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authClient.signOut(),
    onSuccess: () => {
      queryClient.clear();
      window.location.assign('/login');
    },
  });
}
