import { runProductionSeed } from './seed/index.js';

runProductionSeed({ scope: 'all' }).catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
