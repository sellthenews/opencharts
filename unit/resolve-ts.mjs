import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

register(import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.(ts|js|mjs|cjs|json)$/i.test(specifier)) {
    const parent = fileURLToPath(context.parentURL);
    const candidate = join(dirname(parent), `${specifier}.ts`);
    if (existsSync(candidate)) {
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
