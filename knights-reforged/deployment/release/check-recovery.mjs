// Runs after download-artifact even in a backup-only rehearsal. No credentials,
// provider request or database connection is needed to check independent retention.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {candidateDigest} from './candidate.mjs';
import {checkJobReport} from './protocol.mjs';
import {fileDigest} from './transfer.mjs';
try{
 const folder=process.env.RUNNER_TEMP+'/verified-backup';
 const {request,report}=JSON.parse(await readFile(folder+'/backup-manifest.json','utf8'));
 assert.equal(request.sha,process.env.GITHUB_SHA);assert.equal(request.candidateDigest,await candidateDigest());
 checkJobReport(report,request);
 assert.deepEqual(await fileDigest(folder+'/realm.dump.age'),{sha256:report.backup.encryptedSha256,bytes:report.backup.encryptedBytes});
 console.log('Independently retained recovery artifact matches the checked candidate and encrypted export.');
}catch{
 console.error('Independent retained-recovery verification failed. No promotion is authorized.');process.exitCode=1;
}
