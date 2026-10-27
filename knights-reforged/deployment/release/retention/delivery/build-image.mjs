// Build-time only. The controller independently computes the same committed map.
import {roleFiles} from './bundle.mjs';
import {readFile,writeFile,chown} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {hash} from '../protocol.mjs';
const role=process.argv[2],files={};
for(const path of roleFiles(role))files[path]=createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile('delivery-image.json',JSON.stringify({role,files,codeDigest:hash({role,files})}),{mode:0o600,flag:'wx'});
await chown('delivery-image.json',1000,1000);
