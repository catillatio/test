import type { ErasurePermit } from '../../src/privacy/authorization.js';

export function verifyErasureWindow(
 permit: Pick<ErasurePermit, 'codeSha' | 'operationId' | 'coordinator'>,
 options?: { token?: string; fetcher?: typeof fetch; now?: () => number },
): Promise<Pick<ErasurePermit['coordinator'], 'runId' | 'jobId' | 'runAttempt'>>;
