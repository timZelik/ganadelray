import { spawn } from 'node:child_process';
import { PermanentError, RetryableError } from '@fanout/domain';

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

export interface RunProcessOptions {
  timeoutMilliseconds: number;
}

const retainedStderrCharacters = 4_000;

function keepTail(text: string): string {
  return text.length > retainedStderrCharacters ? text.slice(-retainedStderrCharacters) : text;
}

/** Thin typed wrapper over spawn: no shell, bounded stderr, timeout, typed errors. */
export function runProcess(binaryPath: string, processArguments: readonly string[], { timeoutMilliseconds }: RunProcessOptions): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, processArguments, { stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMilliseconds, killSignal: 'SIGKILL' });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr = keepTail(stderr + chunk)));
    child.on('error', (spawnError) => reject(new PermanentError(`Could not start ${binaryPath}: ${spawnError.message}`, { cause: spawnError })));
    child.on('close', (exitCode, signal) => {
      if (exitCode === 0) return resolve({ stdout, stderr });
      if (signal === 'SIGKILL') return reject(new RetryableError(`${binaryPath} timed out after ${timeoutMilliseconds}ms`));
      reject(new PermanentError(`${binaryPath} exited with code ${exitCode}: ${stderr.trim().split('\n').slice(-5).join('\n')}`));
    });
  });
}
