#!/usr/bin/env node
import { runCli } from './run';

process.stdout.on('error', () => {
  process.stderr.write('OUTPUT_STREAM: Cannot write the complete report to stdout.\n');
  process.exit(4);
});
process.exitCode = await runCli(process.argv.slice(2));
