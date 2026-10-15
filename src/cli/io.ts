import { open, realpath, stat, mkdir, rename, unlink, link } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';

export class CliError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export interface ByteBudget {
  used: number;
  maximum: number;
}

/** Reads from an opened file in bounded chunks, including files which grow after stat. */
export async function readTextFile(
  path: string,
  maximum: number,
  budget?: ByteBudget,
): Promise<string> {
  let handle;
  try {
    handle = await open(path, 'r');
  } catch (error) {
    throw fileError(error, 'read', path);
  }
  try {
    const info = await handle.stat();
    if (!info.isFile())
      throw new CliError('INPUT_NOT_FILE', 'Expected a regular file: ' + basename(path));
    if (info.size > maximum)
      throw new CliError(
        'INPUT_TOO_LARGE',
        basename(path) + ' exceeds the ' + maximum + '-byte file limit.',
      );
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(65536, maximum + 1 - size));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > maximum)
        throw new CliError(
          'INPUT_TOO_LARGE',
          basename(path) + ' exceeds the ' + maximum + '-byte file limit.',
        );
      if (budget) {
        budget.used += bytesRead;
        if (budget.used > budget.maximum)
          throw new CliError(
            'BATCH_TOO_LARGE',
            'The batch exceeds the ' +
              budget.maximum +
              '-byte total input limit. Split the corpus into smaller batches.',
          );
      }
      chunks.push(chunk.subarray(0, bytesRead));
    }
    try {
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        Buffer.concat(chunks, size),
      );
    } catch {
      throw new CliError(
        'INPUT_ENCODING',
        basename(path) + ' is not valid UTF-8. Export a UTF-8 JSON snapshot first.',
      );
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw fileError(error, 'read', path);
  } finally {
    await handle.close();
  }
}

function fileError(error: unknown, action: string, path: string): CliError {
  const code =
    error && typeof error === 'object' && 'code' in error ? String(error.code) : 'IO_ERROR';
  return new CliError(
    'FILE_' + code,
    'Cannot ' + action + ' selected file ' + JSON.stringify(basename(path)) + ' (' + code + ').',
  );
}

export function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
}

/** Resolves existing ancestor aliases even when output subdirectories do not exist yet. */
export async function resolveOutputLocation(path: string): Promise<string> {
  let ancestor = dirname(resolve(path));
  const suffix = [basename(path)];
  while (true) {
    try {
      return resolve(await realpath(ancestor), ...suffix);
    } catch (error) {
      if (!isMissing(error) || dirname(ancestor) === ancestor)
        throw fileError(error, 'resolve output directory for', path);
      suffix.unshift(basename(ancestor));
      ancestor = dirname(ancestor);
    }
  }
}

export async function rootedPath(root: string, value: string): Promise<string> {
  if (
    !value ||
    isAbsolute(value) ||
    /^[a-zA-Z]:/u.test(value) ||
    value.startsWith('\\') ||
    value.includes('\\') ||
    /^[a-z][a-z0-9+.-]*:/iu.test(value)
  ) {
    throw new CliError(
      'PAIR_PATH_UNSAFE',
      'Pair paths must be relative local paths using forward slashes.',
    );
  }
  const path = resolve(root, value);
  if (!isWithin(root, path))
    throw new CliError(
      'PAIR_PATH_ESCAPE',
      'A pair path leaves the pairs-file directory: ' + JSON.stringify(value),
    );
  let actual;
  try {
    actual = await realpath(path);
  } catch (error) {
    throw fileError(error, 'resolve', path);
  }
  if (!isWithin(root, actual))
    throw new CliError(
      'PAIR_SYMLINK_ESCAPE',
      'A pair path resolves through a symlink outside the pairs-file directory: ' +
        JSON.stringify(value),
    );
  return actual;
}

/** No overwrite by default; even --force cannot replace an input or a link to it. */
export async function writeOutput(
  path: string,
  content: string,
  inputs: readonly string[],
  force = false,
): Promise<void> {
  const output = resolve(path);
  const resolvedInputs = await Promise.all(
    inputs.map(async (input) => {
      try {
        return await realpath(input);
      } catch {
        return resolve(input);
      }
    }),
  );
  let actualOutput: string;
  let outputInfo;
  try {
    actualOutput = await realpath(output);
    outputInfo = await stat(output);
  } catch (error) {
    if (!isMissing(error)) throw fileError(error, 'inspect output', output);
    // Parent resolution catches output-directory aliases to source locations.
    try {
      actualOutput = resolve(await realpath(dirname(output)), basename(output));
    } catch {
      actualOutput = output;
    }
  }
  for (let index = 0; index < inputs.length; index++) {
    const input = resolvedInputs[index];
    if (input === actualOutput)
      throw new CliError(
        'OUTPUT_IS_INPUT',
        'The output would overwrite a selected input. Choose another path.',
      );
    if (outputInfo && input) {
      try {
        const inputInfo = await stat(input);
        if (inputInfo.dev === outputInfo.dev && inputInfo.ino === outputInfo.ino)
          throw new CliError(
            'OUTPUT_IS_INPUT',
            'The output is a hard link to a selected input. Choose another path.',
          );
      } catch (error) {
        if (error instanceof CliError) throw error;
      }
    }
  }
  if (outputInfo && !force)
    throw new CliError(
      'OUTPUT_EXISTS',
      'Output already exists: ' + basename(output) + '. Use --force to replace a previous report.',
    );
  if (outputInfo && !outputInfo.isFile())
    throw new CliError('OUTPUT_NOT_FILE', 'Output is not a regular file: ' + basename(output));
  await mkdir(dirname(output), { recursive: true });
  const temporary = resolve(dirname(output), '.' + basename(output) + '.' + randomUUID() + '.tmp');
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (force) await rename(temporary, output);
    else {
      await link(temporary, output);
      await unlink(temporary);
    }
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    if (error instanceof CliError) throw error;
    throw fileError(error, 'write output', output);
  }
}

function isMissing(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}
