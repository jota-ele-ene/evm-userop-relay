import {
  sepolia,
  polygon,
  polygonAmoy,
  base,
  optimism,
  arbitrum,
  mainnet,
} from "@account-kit/infra";

export const NETWORKS = {
  ethereum: mainnet,
  sepolia,
  polygon,
  amoy: polygonAmoy,
  base,
  optimism,
  arbitrum,
  mainnet,
};

export function getChain(network) {
  const normalized = String(network || "").trim().toLowerCase();
  const chain = NETWORKS[normalized];

  if (!chain) {
    throw new Error(`Network not supported: ${network}`);
  }

  return chain;
}

export function getRpcUrl(chain) {
  return (
    chain.rpcUrls?.alchemy?.http?.[0] ||
    chain.rpcUrls?.default?.http?.[0] ||
    ""
  );
}

export function getExplorerBaseUrl(network) {
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

export function getExplorerApiUrl(network) {
  const chain = getChain(network);
  const apiUrl = chain.blockExplorers?.default?.apiUrl;

  console.log("[explorer-api] network:", network);
  console.dir(chain.blockExplorers, { depth: null });

  if (!apiUrl) {
    throw new Error(`Explorer API not available for network: ${network}`);
  }

  return apiUrl;
}

export function buildExplorerTxUrl(network, txHash) {
  const baseUrl = getExplorerBaseUrl(network);
  if (!baseUrl || !txHash) return null;
  return `${baseUrl.replace(/\/$/, "")}/tx/${encodeURIComponent(txHash)}`;
}

export function buildExplorerAddressUrl(network, address) {
  const baseUrl = getExplorerBaseUrl(network);
  if (!baseUrl || !address) return null;
  return `${baseUrl.replace(/\/$/, "")}/address/${encodeURIComponent(address)}`;
}

export function buildExplorerUserOpUrl(network, userOpHash) {
  const baseUrl = getExplorerBaseUrl(network);
  if (!baseUrl || !userOpHash) return null;

  return `${baseUrl.replace(/\/$/, "")}/inputdatadecoder?tx=${encodeURIComponent(userOpHash)}`;
}

export function isV2ExplorerApi(apiUrl) {
  return apiUrl.includes("/v2/") || apiUrl.includes("etherscan.io/v2");
}
