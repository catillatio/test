import type {Server} from 'node:http';
export function createJournalRelay(options:{journalPath:string;publicKey:string;readToken:string;scopeDigest:string}):Promise<Server>;
