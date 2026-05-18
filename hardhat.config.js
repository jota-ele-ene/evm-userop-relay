import "dotenv/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
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

const PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

const ACCOUNT_KIT_CHAINS = {
  mainnet,
  ethereum: mainnet,
  sepolia,
  polygon,
  amoy: polygonAmoy,
  polygonAmoy,
  optimism,
  optimismSepolia,
  base,
  baseSepolia,
  arbitrum,
  arbitrumSepolia,
};

function inferChainType(name, chain) {
  const key = String(name).toLowerCase();

  if (chain.id === 1 || chain.id === 11155111) return "l1";

  if (
    key === "optimism" ||
    key === "optimismsepolia" ||
    key === "base" ||
    key === "basesepolia"
  ) {
    return "op";
  }

  return "generic";
}

function getRpcUrl(chain) {
  return (
    chain?.rpcUrls?.default?.http?.[0] ||
    chain?.rpcUrls?.alchemy?.http?.[0] ||
    undefined
  );
}

const accounts = PRIVATE_KEY
  ? [PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`]
  : [];

const networks = Object.fromEntries(
  Object.entries(ACCOUNT_KIT_CHAINS).map(([name, chain]) => [
    name,
    {
      type: "http",
      chainType: inferChainType(name, chain),
      url: process.env[`${name.replace(/-/g, "_").toUpperCase()}_RPC_URL`] || getRpcUrl(chain),
      chainId: chain.id,
      accounts,
    },
  ])
);

export default {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  plugins: [hardhatToolboxMochaEthers, hardhatVerify],
  networks,
  verify: {
    etherscan: {
      apiKey: ETHERSCAN_API_KEY,
    },
  },
};