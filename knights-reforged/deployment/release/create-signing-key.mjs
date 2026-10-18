// Owner runs ONCE on a trusted device. No network, Railway or database access.
// Private key bytes never go to stdout; keep them out of Git and screenshots.
import {generateKeyPairSync} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
process.umask(0o077);
const folder=resolve(process.argv[2]??'.local');
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
writeFileSync(folder+'/kingdom-release-signing.pem',privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
writeFileSync(folder+'/kingdom-release-verify.pem',publicKey.export({type:'spki',format:'pem'}),{mode:0o600,flag:'wx'});
console.log('Created signing and verification files in the selected existing private directory. Store only the private file in the protected GitHub environment secret; Railway receives only the public file.');
