import { pathToFileURL } from 'node:url';
import { register } from 'node:module';

register('./test-hooks.mjs', import.meta.url);
