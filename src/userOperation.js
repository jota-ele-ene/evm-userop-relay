import "dotenv/config";
import { createLightAccountAlchemyClient } from "@alchemy/aa-alchemy";
import { LocalAccountSigner } from "@alchemy/aa-core";
import { encodeFunctionData } from "viem";
import {
  sepolia,
  polygon,
  polygonAmoy,
  base,
  optimism,
  arbitrum,
  mainnet,
} from "@account-kit/infra";

const CHAIN_MAP = {
  ethereum: mainnet,
  sepolia,
  polygon,
  amoy: polygonAmoy,
  base,
  optimism,
  arbitrum,
  mainnet,
};

function getChain(network) {
  const chain = CHAIN_MAP[String(network || "").trim().toLowerCase()];
  if (!chain) {
    throw new Error(`Network not supported: ${network}`);
  }
  return chain;
}

function getExplorerApiUrl(network) {
  const chain = getChain(network);
  const apiUrl = chain.blockExplorers?.default?.apiUrl;

  if (!apiUrl) {
    throw new Error(`Explorer API not available for network: ${network}`);
  }

  return apiUrl;
}

function isV2ExplorerApi(apiUrl) {
  return apiUrl.includes("/v2/") || apiUrl.includes("etherscan.io/v2");
}

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

async function fetchContractAbi(network, address) {
  const chain = getChain(network);
  const apiUrl = getExplorerApiUrl(network);

  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ETHERSCAN_API_KEY in environment");
  }

  const url = new URL(apiUrl);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "getabi");
  url.searchParams.set("address", address);
  url.searchParams.set("apikey", apiKey);

  if (isV2ExplorerApi(apiUrl)) {
    url.searchParams.set("chainid", String(chain.id));
  }

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status !== "1") {
    throw new Error(data.result || "Unable to fetch contract ABI");
  }

  const abi = typeof data.result === "string" ? JSON.parse(data.result) : data.result;

  if (!Array.isArray(abi)) {
    throw new Error("Explorer returned an invalid ABI format");
  }

  return abi;
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
  const provider = await getProvider(network);

  const target = payload.contractAddress;
  if (!target || !isAddress(target)) {
    throw new Error("Missing or invalid contractAddress in request");
  }

  const abi = await fetchContractAbi(network, target);

  const functionAbi = abi.find(
    (item) =>
      item.type === "function" &&
      `${item.name}(${item.inputs.map((input) => input.type).join(",")})` ===
        payload.functionSignature
  );

  if (!functionAbi) {
    throw new Error(`Function ${payload.functionSignature} not found in contract ABI`);
  }

  const data = encodeFunctionData({
    abi: [functionAbi],
    functionName: functionAbi.name,
    args: payload.args || [],
  });

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
    console.warn("[aa-provider] waitForUserOperationTransaction failed:", waitErr.message);
  }

  return {
    hash: result.hash,
    txHash,
    calldata: data,
  };
}