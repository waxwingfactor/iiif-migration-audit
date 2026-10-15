#!/usr/bin/env node
import { runCli } from './run';

process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0);
  else {
    process.stderr.write('OUTPUT_STREAM: Cannot write the report to stdout.\n');
    process.exit(4);
  }
});
process.exitCode = await runCli(process.argv.slice(2));
