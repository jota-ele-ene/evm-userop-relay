import "dotenv/config";
import { createLightAccountAlchemyClient } from "@alchemy/aa-alchemy";
import { LocalAccountSigner } from "@alchemy/aa-core";
import {
  NETWORKS,
  getChain,
} from "./chains.js";

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

const providerCache = new Map();

async function getProvider(networkName) {
  const normalizedNetwork = String(networkName || "sepolia").trim().toLowerCase();

  if (providerCache.has(normalizedNetwork)) {
    return providerCache.get(normalizedNetwork);
  }

  const {
    ALCHEMY_API_KEY,
    ALCHEMY_GAS_POLICY_ID,
    OWNER_PRIVATE_KEY,
  } = process.env;

  if (!ALCHEMY_API_KEY) throw new Error("Missing ALCHEMY_API_KEY in env");
  if (!ALCHEMY_GAS_POLICY_ID) throw new Error("Missing ALCHEMY_GAS_POLICY_ID in env");
  if (!OWNER_PRIVATE_KEY) throw new Error("Missing OWNER_PRIVATE_KEY in env");

  const chain = getChain(normalizedNetwork);

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

  providerCache.set(normalizedNetwork, provider);
  return provider;
}

export async function submitUserOperation(payload, network) {

  console.log("[submitUserOperation.payload]", payload);
  
  const provider = await getProvider(network);

  const target = payload.contractAddress;
  if (!target || !isAddress(target)) {
    throw new Error("Missing or invalid contractAddress in request");
  }

  const data = payload.calldata;
  if (!data || typeof data !== "string" || !data.startsWith("0x")) {
    throw new Error("Missing or invalid calldata in request");
  }

  const result = await provider.sendUserOperation({
    uo: {
      target,
      data,
      value: 0n,
    },
  });

  let txHash = null;
  try {
    txHash = await provider.waitForUserOperationTransaction({ hash: result.hash });
  } catch (waitErr) {
    console.warn(
      "[aa-provider] waitForUserOperationTransaction failed:",
      waitErr.message
    );
  }

  return {
    hash: result.hash,
    txHash,
    calldata: data,
  };
}