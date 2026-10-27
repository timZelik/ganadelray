import { authenticationBasePath } from '@fanout/api-contract';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({ basePath: authenticationBasePath });
