import { createModularAccountAlchemyClient } from '@alchemy/aa-alchemy';
import { LocalAccountSigner } from '@alchemy/aa-core';
import {
  sepolia,
  polygon,
  base,
  optimism,
  arbitrum,
  mainnet,
} from 'viem/chains';

const CHAIN_MAP = {
  sepolia,
  polygon,
  base,
  optimism,
  arbitrum,
  mainnet,
};

// Lazily-created singleton client (one per process lifetime)
let _client = null;

async function getClient() {
  if (_client) return _client;

  const {
    ALCHEMY_API_KEY,
    ALCHEMY_GAS_POLICY_ID,
    OWNER_PRIVATE_KEY,
    NETWORK = 'sepolia',
  } = process.env;

  if (!ALCHEMY_API_KEY) throw new Error('Missing ALCHEMY_API_KEY in env');
  if (!ALCHEMY_GAS_POLICY_ID) throw new Error('Missing ALCHEMY_GAS_POLICY_ID in env');
  if (!OWNER_PRIVATE_KEY) throw new Error('Missing OWNER_PRIVATE_KEY in env');

  const chain = CHAIN_MAP[NETWORK.toLowerCase()];
  if (!chain) throw new Error(`Unsupported NETWORK "${NETWORK}". Choose: ${Object.keys(CHAIN_MAP).join(', ')}`);

  const privateKey = OWNER_PRIVATE_KEY.startsWith('0x')
    ? OWNER_PRIVATE_KEY
    : `0x${OWNER_PRIVATE_KEY}`;

  const signer = LocalAccountSigner.privateKeyToAccountSigner(privateKey);

  _client = await createModularAccountAlchemyClient({
    apiKey: ALCHEMY_API_KEY,
    chain,
    signer,
    gasManagerConfig: {
      policyId: ALCHEMY_GAS_POLICY_ID,
    },
  });

  console.log('[aa-client] Smart Account address:', _client.getAddress());
  return _client;
}

/**
 * Submits a sponsored UserOperation.
 *
 * @param {`0x${string}`} calldata – ABI-encoded calldata (or raw bytes as hex)
 * @returns {{ hash: string, txHash: string|null }}
 */
export async function submitUserOperation(calldata) {
  const client = await getClient();

  const target = /** @type {`0x${string}`} */ (
    process.env.TARGET_CONTRACT_ADDRESS
  );
  if (!target || !target.startsWith('0x')) {
    throw new Error('Missing or invalid TARGET_CONTRACT_ADDRESS in env');
  }

  console.log('[aa-client] sending UserOperation to', target);

  const { hash: uoHash } = await client.sendUserOperation({
    uo: {
      target,
      data: calldata,   // POST body becomes calldata here
      value: 0n,
    },
  });

  console.log('[aa-client] UserOperation hash:', uoHash);

  // Wait for the UserOp to land in a mined tx
  let txHash = null;
  try {
    txHash = await client.waitForUserOperationTransaction({ hash: uoHash });
    console.log('[aa-client] mined tx hash:', txHash);
  } catch (waitErr) {
    // Non-fatal – we already have the uoHash
    console.warn('[aa-client] waitForUserOperationTransaction failed:', waitErr.message);
  }

  return { hash: uoHash, txHash };
}
