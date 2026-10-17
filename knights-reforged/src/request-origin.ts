import type {IncomingHttpHeaders} from 'node:http';
import type {Config} from './config.js';

// Referer may include a path/query. Only its HTTP(S) origin is relevant;
// credentials, opaque URLs and malformed headers never establish an origin.
// Also used to keep paths, queries and credentials out of diagnostic logs.
export function urlOrigin(value:unknown):string|null {
  if(typeof value!=='string')return null;
  try {
    const url=new URL(value);
    return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.origin:null;
  }catch{return null;}
}

// Call only AFTER the session-bound CSRF token has been validated.
export function requestOriginAllowed(config:Config,headers:IncomingHttpHeaders):boolean {
  const origin=headers.origin;
  // Preserve the token-authenticated non-browser API policy. Present Origins
  // always undergo validation; Origin: null is never treated as missing.
  if(origin===undefined||origin===config.origin)return true;

  // Codespaces/Dev Tunnels can rewrite a same-origin browser Origin to the
  // upstream localhost address but preserve Referer and Fetch Metadata.
  // Scope this exception to THIS Codespace's exact server-configured HTTPS
  // origin and port. A loopback Origin alone is never sufficient.
  if(!config.secureCookies||config.origin!==config.codespacesOrigin)return false;
  if(origin!==`http://localhost:${config.port}`&&origin!==`https://localhost:${config.port}`)return false;
  // Host, Forwarded and X-Forwarded-* never select an allowed source origin.
  return headers['sec-fetch-site']==='same-origin'&&urlOrigin(headers.referer)===config.origin;
}
