import { Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

@Injectable()
export class SpecService {
  async getSpec(): Promise<{ content: string }> {
    const candidates = [
      resolve(moduleDirectory, '../SPEC.md'),
      resolve(moduleDirectory, '../../../SPEC.md'),
      resolve(process.cwd(), 'SPEC.md'),
    ];
    for (const path of candidates) {
      try {
        return { content: await readFile(path, 'utf8') };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    throw new Error('SPEC.md was not included with this release');
  }
}
