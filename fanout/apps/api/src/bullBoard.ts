import { bullBoardBasePath } from '@fanout/api-contract';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import type { Queue } from 'bullmq';
import type { ApiServer } from './server.ts';

/** Bull Board at /admin/queues for low-level queue inspection (the dashboard covers day-to-day use). */
export async function mountBullBoard(server: ApiServer, queues: Queue[]): Promise<void> {
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath(bullBoardBasePath);
  createBullBoard({ queues: queues.map((queue) => new BullMQAdapter(queue)), serverAdapter });
  await server.register(serverAdapter.registerPlugin(), { prefix: bullBoardBasePath });
}
