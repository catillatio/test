// Repository compatibility entrypoint; the same guarded, candidate-hashed command
// is also available as node dist/expansion-console.js in the private game Console.
import {runExpansionOperator} from '../dist/expansion-console.js';
await runExpansionOperator();
