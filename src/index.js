import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { submitUserOperation } from "./userOperation.js";
import {
  sepolia,
  polygon,
  polygonAmoy,
  base,
  optimism,
  arbitrum,
  mainnet,
} from "@account-kit/infra";
import { encodeFunctionData } from "viem";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontDir = path.join(__dirname, "../front");

const NETWORKS = {
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
  const normalized = String(network || "").trim().toLowerCase();
  const chain = NETWORKS[normalized];

  if (!chain) {
    throw new Error(`Network not supported: ${network}`);
  }

  return chain;
}

function getRpcUrl(chain) {
  return (
    chain.rpcUrls?.alchemy?.http?.[0] ||
    chain.rpcUrls?.default?.http?.[0] ||
    ""
  );
}

function getExplorerBaseUrl(network) {
  const chain = getChain(network);

  console.log("[explorer]", {
    network,
    chainName: chain.name,
    chainId: chain.id,
    explorerUrl: chain.blockExplorers?.default?.url || null,
    explorerApiUrl: chain.blockExplorers?.default?.apiUrl || null,
  });

  return chain.blockExplorers?.default?.url || "";
}

function getExplorerApiUrl(network) {
  const chain = getChain(network);
  const apiUrl = chain.blockExplorers?.default?.apiUrl;

  console.log("[explorer-api] network:", network);
  console.dir(chain.blockExplorers, { depth: null });

  if (!apiUrl) {
    throw new Error(`Explorer API not available for network: ${network}`);
  }

  return apiUrl;
}

function buildExplorerTxUrl(network, txHash) {
  const baseUrl = getExplorerBaseUrl(network);
  if (!baseUrl || !txHash) return null;
  return `${baseUrl.replace(/\/$/, "")}/tx/${encodeURIComponent(txHash)}`;
}

function buildExplorerAddressUrl(network, address) {
  const baseUrl = getExplorerBaseUrl(network);
  if (!baseUrl || !address) return null;
  return `${baseUrl.replace(/\/$/, "")}/address/${encodeURIComponent(address)}`;
}

function buildExplorerUserOpUrl(network, userOpHash) {
  const baseUrl = getExplorerBaseUrl(network);
  if (!baseUrl || !userOpHash) return null;

  return `${baseUrl.replace(/\/$/, "")}/inputdatadecoder?tx=${encodeURIComponent(userOpHash)}`;
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

function normalizeAbiInput(input) {
  return {
    name: input.name,
    type: input.type,
    components: input.components?.map(normalizeAbiInput),
  };
}

function formatAbiFunctions(abi) {
  if (!Array.isArray(abi)) {
    throw new Error("ABI must be an array");
  }

  return abi
    .filter((item) => item.type === "function")
    .filter(
      (item) => item.stateMutability !== "view" && item.stateMutability !== "pure"
    )
    .map((fn) => ({
      name: fn.name,
      signature: `${fn.name}(${fn.inputs.map((input) => input.type).join(",")})`,
      inputs: fn.inputs.map(normalizeAbiInput),
    }));
}

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function serializeBigInt(value) {
  return JSON.parse(
    JSON.stringify(value, (_, item) =>
      typeof item === "bigint" ? item.toString() : item
    )
  );
}

app.get("/api/networks", (req, res) => {
  const networks = Object.entries(NETWORKS).map(([id, chain]) => ({
    id,
    name: chain.name,
    chainId: chain.id,
    rpcUrl: getRpcUrl(chain),
    explorerUrl: chain.blockExplorers?.default?.url || "",
    explorerApiUrl: chain.blockExplorers?.default?.apiUrl || "",
  }));

  res.json({ networks });
});

app.get("/api/contract-abi", async (req, res) => {
  const { address, network } = req.query;

  try {
    if (!address || !network) {
      return res.status(400).json({
        status: "error",
        message: "Missing address or network query parameter",
      });
    }

    if (!isAddress(address)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid contract address",
      });
    }

    const abi = await fetchContractAbi(network, address);
    const functions = formatAbiFunctions(abi);

    return res.json({
      contractAddress: address,
      network,
      explorerUrl: getExplorerBaseUrl(network),
      contractUrl: buildExplorerAddressUrl(network, address),
      functions,
    });
  } catch (error) {
    console.error("[api/contract-abi] error:", error);
    return res.status(500).json({
      status: "error",
      message: error?.message || String(error),
    });
  }
});

function getFunctionFromAbi(abi, functionSignature) {
  const fn = abi.find(
    (item) =>
      item.type === "function" &&
      `${item.name}(${(item.inputs || []).map((input) => input.type).join(",")})` ===
        functionSignature
  );

  if (!fn) {
    throw new Error(`Function ${functionSignature} not found in contract ABI`);
  }

  return fn;
}

function normalizeJsonArgForInput(input, value) {
  const type = input?.type || "";
  const components = input?.components || [];

  if (type.endsWith("[]")) {
    if (!Array.isArray(value)) {
      throw new Error(`Field "${input.name || type}" must be an array`);
    }

    const itemInput = { ...input, type: type.replace(/\[\]$/, "") };
    return value.map((item) => normalizeJsonArgForInput(itemInput, item));
  }

  if (type === "tuple") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Field "${input.name || "tuple"}" must be a JSON object`);
    }

    return components.map((component, index) => {
      const key = component.name || `field${index}`;
      return normalizeJsonArgForInput(component, value[key]);
    });
  }

  if (type.startsWith("tuple[")) {
    if (!Array.isArray(value)) {
      throw new Error(`Field "${input.name || type}" must be an array of objects`);
    }

    const itemType = type.replace(/\[[^\]]*\]$/, "");
    const tupleInput = { ...input, type: itemType };

    return value.map((item) => normalizeJsonArgForInput(tupleInput, item));
  }

  if (value === undefined) {
    throw new Error(`Missing field "${input.name || type}"`);
  }

  return value;
}

async function buildValidatedCall({ network, contractAddress, functionSignature, inputJson }) {
  if (!network) {
    throw new Error('Path param "network" is required');
  }

  if (!contractAddress || !isAddress(contractAddress)) {
    throw new Error('Path param "contractAddress" must be a valid address');
  }

  if (!functionSignature) {
    throw new Error('Path param "functionSignature" is required');
  }

  const abi = await fetchContractAbi(network, contractAddress);
  const functionAbi = getFunctionFromAbi(abi, functionSignature);
  const inputs = functionAbi.inputs || [];

  let args;

  if (inputs.length === 0) {
    args = [];
  } else if (inputs.length === 1 && inputs[0].type === "tuple") {
    args = [normalizeJsonArgForInput(inputs[0], inputJson)];
  } else if (inputs.length === 1 && inputs[0].type.startsWith("tuple[")) {
    args = [normalizeJsonArgForInput(inputs[0], inputJson)];
  } else {
    throw new Error("This endpoint only accepts functions with one tuple or tuple[] input");
  }

  const calldata = encodeFunctionData({
    abi: [functionAbi],
    functionName: functionAbi.name,
    args,
  });

  return {
    abi,
    functionAbi,
    args,
    calldata,
  };
}

app.post("/api/validate-input-json/:network/:contractAddress/:functionSignature", async (req, res) => {
  try {
    const { network, contractAddress, functionSignature } = req.params;
    const inputJson = req.body;

    const validated = await buildValidatedCall({
      network,
      contractAddress,
      functionSignature,
      inputJson,
    });

    return res.json({
      status: "ok",
      network,
      contractAddress,
      functionSignature,
      explorerBaseUrl: getExplorerBaseUrl(network),
      function: {
        name: validated.functionAbi.name,
        inputs: validated.functionAbi.inputs,
      },
      normalizedArgs: serializeBigInt(validated.args),
      calldata: validated.calldata,
    });
  } catch (error) {
    console.error("[api/validate-input-json] error:", error);

    return res.status(400).json({
      status: "error",
      message: error?.message || "Validation failed",
      error: {
        name: error?.name || "Error",
        shortMessage: error?.shortMessage || null,
        details: error?.details || null,
        cause: error?.cause?.message || null,
      },
      receivedBody: req.body,
    });
  }
});

app.post("/api/submit-json/:network/:contractAddress/:functionSignature", async (req, res) => {
  try {
    const { network, contractAddress, functionSignature } = req.params;
    const inputJson = req.body;

    const validated = await buildValidatedCall({
      network,
      contractAddress,
      functionSignature,
      inputJson,
    });

    const result = await submitUserOperation(
      {
        contractAddress,
        functionSignature,
        args: validated.args,
      },
      network
    );

    const explorerBaseUrl = getExplorerBaseUrl(network);
    const txUrl = buildExplorerTxUrl(network, result.txHash);
    const contractUrl = buildExplorerAddressUrl(network, contractAddress);
    const userOpUrl = buildExplorerUserOpUrl(network, result.hash);

    console.log("[submit-json/explorer]", {
      network,
      baseUrl: explorerBaseUrl,
      txHash: result.txHash,
      txUrl,
      contractAddress,
      contractUrl,
      userOpHash: result.hash,
      userOpUrl,
    });

    return res.json({
      status: "ok",
      network,
      contractAddress,
      functionSignature,
      explorer: {
        baseUrl: explorerBaseUrl,
        txUrl,
        userOpUrl,
        contractUrl,
      },
      validation: {
        normalizedArgs: serializeBigInt(validated.args),
        calldata: validated.calldata,
      },
      result: serializeBigInt(result),
    });
  } catch (error) {
    console.error("[api/submit-json] error:", error);

    return res.status(400).json({
      status: "error",
      message: error?.message || "Submit failed",
      error: {
        name: error?.name || "Error",
        shortMessage: error?.shortMessage || null,
        details: error?.details || null,
        cause: error?.cause?.message || null,
      },
      receivedBody: req.body,
    });
  }
});

app.post("/api/submit", async (req, res) => {
  try {
    const { contractAddress, functionSignature, args, network } = req.body;

    const result = await submitUserOperation(
      { contractAddress, functionSignature, args },
      network
    );

    const explorerBaseUrl = getExplorerBaseUrl(network);
    const txUrl = buildExplorerTxUrl(network, result.txHash);
    const contractUrl = buildExplorerAddressUrl(network, contractAddress);
    const userOpUrl = buildExplorerUserOpUrl(network, result.hash);

    console.log("[submit/explorer]", {
      network,
      baseUrl: explorerBaseUrl,
      txHash: result.txHash,
      txUrl,
      contractAddress,
      contractUrl,
      userOpHash: result.hash,
      userOpUrl,
    });

    res.json({
      status: "ok",
      result: serializeBigInt(result),
      explorer: {
        baseUrl: explorerBaseUrl,
        txUrl,
        userOpUrl,
        contractUrl,
      },
    });
  } catch (error) {
    console.error("[relay] error:", error);
    res.status(500).json({
      status: "error",
      message: error?.message || String(error),
      stack: error?.stack || null,
    });
  }
});

app.use(express.static(frontDir));

app.use((req, res) => {
  res.sendFile(path.join(frontDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Relay listening on http://localhost:${port}`);
});