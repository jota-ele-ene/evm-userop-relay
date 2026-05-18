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
};

function getRpcUrl(chain) {
  return (
    chain.rpcUrls?.alchemy?.http?.[0] ||
    chain.rpcUrls?.default?.http?.[0] ||
    ""
  );
}

function getExplorerBaseUrl(networkId) {
  const envKey = `${String(networkId).trim().toUpperCase()}_EXPLORER_BASE_URL`;
  return process.env[envKey] || process.env.EXPLORER_BASE_URL || "";
}

const EXPLORER_API_HOSTS = {
  ethereum: "api.etherscan.io",
  sepolia: "api-sepolia.etherscan.io",
  polygon: "api.polygonscan.com",
  optimism: "api-optimistic.etherscan.io",
  arbitrum: "api.arbiscan.io",
  base: "api.basescan.org",
};

function getChain(network) {
  const chain = NETWORKS[network];
  if (!chain) {
    throw new Error(`Network not supported for ABI lookup: ${network}`);
  }
  return chain;
}

function getExplorerApiUrl(network) {
  const chain = getChain(network);
  const apiUrl = chain.blockExplorers?.default?.apiUrl;
  if (apiUrl) {
    return apiUrl;
  }

  const apiHost = EXPLORER_API_HOSTS[network];
  if (!apiHost) {
    throw new Error(`Network not supported for ABI lookup: ${network}`);
  }
  return `https://${apiHost}/api`;
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

  return JSON.parse(data.result);
}

function formatAbiFunctions(abi) {
  return abi
    .filter((item) => item.type === "function")
    .filter(
      (item) => item.stateMutability !== "view" && item.stateMutability !== "pure"
    )
    .map((fn) => ({
      name: fn.name,
      signature: `${fn.name}(${fn.inputs.map((input) => input.type).join(",")})`,
      inputs: fn.inputs.map(({ name, type }) => ({ name, type })),
    }));
}

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use("/api", (req, res, next) => {
  console.log(`[api] incoming ${req.method} ${req.originalUrl}`);
  next();
});

function serializeBigInt(value) {
  return JSON.parse(
    JSON.stringify(value, (_, item) =>
      typeof item === "bigint" ? item.toString() : item
    )
  );
}

app.get("/api/networks", (req, res) => {
  console.log(`[api/networks] incoming ${req.method} ${req.originalUrl}`);
  const networks = Object.entries(NETWORKS).map(([id, chain]) => ({
    id,
    name: chain.name,
    chainId: chain.id,
    rpcUrl: getRpcUrl(chain),
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

app.post("/api/submit", async (req, res) => {
  try {
    const { contractAddress, functionSignature, args, network } = req.body;
    const result = await submitUserOperation(
      { contractAddress, functionSignature, args },
      network
    );

    res.json({
      status: "ok",
      result: serializeBigInt(result),
      explorerBaseUrl: getExplorerBaseUrl(network),
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

app.use("/api", (req, res) => {
  console.warn(`[api/missing] no route for ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    status: "error",
    message: `API route not found: ${req.originalUrl}`,
  });
});

app.use(express.static(frontDir));

app.use((req, res) => {
  res.sendFile(path.join(frontDir, "index.html"));
});

app.listen(port, () => {
  console.log(`Relay listening on http://localhost:${port}`);
});
