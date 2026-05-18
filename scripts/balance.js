import { parseArgs } from "node:util";
import { createPublicClient, http, formatEther, isAddress } from "viem";
import {
  mainnet,
  sepolia,
  polygon,
  polygonAmoy,
  optimism,
  optimismSepolia,
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
} from "@account-kit/infra";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    network: { type: "string", short: "n" },
    address: { type: "string", short: "a" },
    rpc: { type: "string", short: "r" },
  },
});

const NETWORKS = {
  ethereum: mainnet,
  mainnet,
  sepolia,
  polygon,
  amoy: polygonAmoy,
  polygonamoy: polygonAmoy,
  "polygon-amoy": polygonAmoy,
  optimism,
  optimismsepolia: optimismSepolia,
  "optimism-sepolia": optimismSepolia,
  base,
  basesepolia: baseSepolia,
  "base-sepolia": baseSepolia,
  arbitrum,
  arbitrumsepolia: arbitrumSepolia,
  "arbitrum-sepolia": arbitrumSepolia,
};

function getChain(name) {
  const key = String(name || "").toLowerCase();
  const chain = NETWORKS[key];

  if (!chain) {
    throw new Error(
      `Unsupported network "${name}". Opciones: ${Object.keys(NETWORKS).join(", ")}`
    );
  }

  return chain;
}

async function main() {
  if (!values.network) {
    throw new Error("Falta --network <red>");
  }

  if (!values.address) {
    throw new Error("Falta --address <0x...>");
  }

  if (!isAddress(values.address)) {
    throw new Error(`Dirección inválida: ${values.address}`);
  }

  const chain = getChain(values.network);
  const rpcUrl = values.rpc || chain.rpcUrls?.default?.http?.[0];

  if (!rpcUrl) {
    throw new Error(`No RPC URL available for network "${values.network}"`);
  }

  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const [balanceWei, blockNumber] = await Promise.all([
    client.getBalance({ address: values.address }),
    client.getBlockNumber(),
  ]);

  const nativeSymbol = chain.nativeCurrency?.symbol || "ETH";
  const explorer = chain.blockExplorers?.default?.url || "";
  const maxGasAt1Gwei = balanceWei / 1_000_000_000n;

  console.log(`network=${values.network}`);
  console.log(`chainName=${chain.name}`);
  console.log(`chainId=${chain.id}`);
  console.log(`address=${values.address}`);
  console.log(`rpcUrl=${rpcUrl}`);
  console.log(`explorer=${explorer}`);
  console.log(`blockNumber=${blockNumber.toString()}`);
  console.log(`balanceWei=${balanceWei.toString()}`);
  console.log(`balanceNative=${formatEther(balanceWei)}`);
  console.log(`nativeSymbol=${nativeSymbol}`);
  console.log(`maxGasUnitsAt1Gwei=${maxGasAt1Gwei.toString()}`);
}
main().catch((err) => {
  console.error(`error=${err.message}`);
  process.exit(1);
});