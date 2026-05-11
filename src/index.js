import 'dotenv/config';
import express from 'express';
import { submitUserOperation } from './userOperation.js';

const app = express();
app.use(express.json());
app.use(express.text({ type: 'text/*' }));
app.use(express.raw({ type: 'application/octet-stream' }));

/**
 * POST /relay
 *
 * Body (JSON, text, or hex string) → calldata in a sponsored UserOperation.
 *
 * If the body is a JSON object, it is ABI-encoded as UTF-8 bytes.
 * If the body is already a 0x-prefixed hex string it is used as-is.
 * Any other string is converted to hex bytes.
 */
app.post('/relay', async (req, res) => {
  try {
    const calldata = resolveCalldata(req.body, req.headers['content-type']);
    console.log('[relay] calldata →', calldata.slice(0, 66) + (calldata.length > 66 ? '…' : ''));

    const result = await submitUserOperation(calldata);

    return res.status(202).json({
      status: 'submitted',
      userOpHash: result.hash,
      txHash: result.txHash ?? null,
    });
  } catch (err) {
    console.error('[relay] error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Health-check
app.get('/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolves any POST body type to a 0x-prefixed hex string suitable for calldata.
 */
function resolveCalldata(body, contentType) {
  if (!body) throw new Error('Empty request body');

  // Already a Buffer (application/octet-stream)
  if (Buffer.isBuffer(body)) {
    return '0x' + body.toString('hex');
  }

  // String that is already hex-encoded
  if (typeof body === 'string' && body.startsWith('0x')) {
    return body;
  }

  // JSON object / array – serialize then hex-encode
  if (typeof body === 'object') {
    return '0x' + Buffer.from(JSON.stringify(body), 'utf8').toString('hex');
  }

  // Plain string – hex-encode UTF-8
  return '0x' + Buffer.from(String(body), 'utf8').toString('hex');
}
