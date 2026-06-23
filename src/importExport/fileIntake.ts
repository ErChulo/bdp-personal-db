import { MAX_IMPORT_BYTES } from '../workspace/types';

export function ensureFileWithinLimit(file: File, label = 'file'): void {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(`${label} is too large; maximum size is 500 MB`);
  }
}

export async function readTextFile(file: File): Promise<string> {
  ensureFileWithinLimit(file, file.name);
  if (!file.stream) return new TextDecoder().decode(await file.arrayBuffer());
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock?.();
  }
}

