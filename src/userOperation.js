import "dotenv/config";
import { createLightAccountAlchemyClient } from "@alchemy/aa-alchemy";
import { LocalAccountSigner } from "@alchemy/aa-core";
import { encodeFunctionData, keccak256, stringToHex } from "viem";
import {
  sepolia,
  polygon,
  base,
  optimism,
  arbitrum,
  mainnet,
} from "@account-kit/infra";

const CHAIN_MAP = {
  sepolia,
  polygon,
  base,
  optimism,
  arbitrum,
  mainnet,
};

const JSON_REGISTRY_ABI = [
  {
    type: "function",
    name: "registerRecord",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "input",
        type: "tuple",
        components: [
          { name: "title", type: "string" },
          { name: "body", type: "string" },
          { name: "category", type: "string" },
          { name: "createdAt", type: "uint256" },
          { name: "externalId", type: "bytes32" },
        ],
      },
    ],
    outputs: [],
  },
];

let clientPromise = null;

async function getProvider() {
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const {
      ALCHEMY_API_KEY,
      ALCHEMY_GAS_POLICY_ID,
      OWNER_PRIVATE_KEY,
      NETWORK = "sepolia",
    } = process.env;

    if (!ALCHEMY_API_KEY) throw new Error("Missing ALCHEMY_API_KEY in env");
    if (!ALCHEMY_GAS_POLICY_ID) throw new Error("Missing ALCHEMY_GAS_POLICY_ID in env");
    if (!OWNER_PRIVATE_KEY) throw new Error("Missing OWNER_PRIVATE_KEY in env");

    const chain = CHAIN_MAP[NETWORK.toLowerCase()];
    if (!chain) {
      throw new Error(
        `Unsupported NETWORK "${NETWORK}". Choose: ${Object.keys(CHAIN_MAP).join(", ")}`
      );
    }

    const privateKey = OWNER_PRIVATE_KEY.startsWith("0x")
      ? OWNER_PRIVATE_KEY
      : `0x${OWNER_PRIVATE_KEY}`;

    const signer = LocalAccountSigner.privateKeyToAccountSigner(privateKey);

    const provider = await createLightAccountAlchemyClient({
      apiKey: ALCHEMY_API_KEY,
      chain,
      signer,
      gasManagerConfig: {
        policyId: ALCHEMY_GAS_POLICY_ID,
      },
    });

    const address = await provider.getAddress();
    console.log("[aa-provider] Smart Account address:", address);

    return provider;
  })();

  return clientPromise;
}

export async function submitUserOperation(rawPayload) {
  const provider = await getProvider();

  const target = process.env.TARGET_CONTRACT_ADDRESS;
  if (!target || !target.startsWith("0x")) {
    throw new Error("Missing or invalid TARGET_CONTRACT_ADDRESS in env");
  }

  const record = normalizePayload(rawPayload);

  const data = encodeFunctionData({
    abi: JSON_REGISTRY_ABI,
    functionName: "registerRecord",
    args: [record],
  });

  console.log("[aa-provider] sending UserOperation to", target);
  console.log("[aa-provider] record:", record);

  const result = await provider.sendUserOperation({
    uo: {
      target,
      data,
      value: 0n,
    },
  });

  console.log("[aa-provider] UserOperation hash:", result.hash);

  let txHash = null;
  try {
    txHash = await provider.waitForUserOperationTransaction({ hash: uoHash });
    console.log("[aa-provider] mined tx hash:", txHash);
  } catch (waitErr) {
    console.warn("[aa-provider] waitForUserOperationTransaction failed:", waitErr.message);
  }

  return {
    hash: result.hash,
    txHash,
    calldata: data,
    record,
  };
}

function normalizePayload(rawPayload) {
  let parsed;

  try {
    parsed = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  } catch {
    throw new Error("Invalid JSON payload");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload must be a JSON object");
  }

  if (!parsed.title || !String(parsed.title).trim()) {
    throw new Error('Field "title" is required');
  }

  if (!parsed.body || !String(parsed.body).trim()) {
    throw new Error('Field "body" is required');
  }

  const createdAt =
    parsed.createdAt != null
      ? BigInt(parsed.createdAt)
      : BigInt(Math.floor(Date.now() / 1000));

  let externalId = parsed.externalId;
  if (!externalId) {
    externalId = keccak256(stringToHex(JSON.stringify(parsed)));
  }

  if (typeof externalId !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(externalId)) {
    throw new Error('Field "externalId" must be a valid bytes32 hex string');
  }

  return {
    title: String(parsed.title),
    body: String(parsed.body),
    category: String(parsed.category ?? ""),
    createdAt,
    externalId,
  };
}