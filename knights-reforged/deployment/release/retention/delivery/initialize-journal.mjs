import {initializeVolume} from './volume.mjs';
try{await initializeVolume();}catch{console.error('RETENTION_JOURNAL_INITIALIZATION: FAIL');process.exitCode=1;}
