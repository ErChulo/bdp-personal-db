/// <reference lib="webworker" />
import { generateAesKey } from '../keygen/aes';

interface Req {
  id: string;
  bits: 128 | 192 | 256;
  format: 'hex' | 'base64';
}

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, bits, format } = e.data;
  try {
    const key = await generateAesKey(bits, format);
    (self as any).postMessage({ id, ok: true, key });
  } catch (err) {
    (self as any).postMessage({ id, ok: false, error: (err as Error).message });
  }
};
