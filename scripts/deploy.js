import { parseArgs } from "node:util";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import {
  mainnet,
  sepolia,
  polygon,
  polygonAmoy,
  optimism,
  base,
  arbitrum,
  arbitrumSepolia,
  baseSepolia,
  optimismSepolia,
} from "@account-kit/infra";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    network: { type: "string" },
    contract: { type: "string" },
    address: { type: "string" },
    arg: { type: "string", multiple: true },
  },
});

const [mode] = positionals;

if (!mode || !["deploy", "verify"].includes(mode)) {
  console.error(
    "Uso:\n" +
      "  node scripts/deploy.js deploy --network <red> --contract <Contrato> [--arg valor1 --arg valor2]\n" +
      "  node scripts/deploy.js verify --network <red> --address <0x...> [--arg valor1 --arg valor2]"
  );
  process.exit(1);
}

if (!values.network) {
  console.error("Falta --network <red>");
  process.exit(1);
}

const ACCOUNT_KIT_NETWORKS = {
  ethereum: mainnet,
  mainnet,
  sepolia,
  polygon,
  amoy: polygonAmoy,
  polygonamoy: polygonAmoy,
  "polygon-amoy": polygonAmoy,
  optimism,
  "optimism-sepolia": optimismSepolia,
  optimismsepolia: optimismSepolia,
  base,
  "base-sepolia": baseSepolia,
  basesepolia: baseSepolia,
  arbitrum,
  "arbitrum-sepolia": arbitrumSepolia,
  arbitrumsepolia: arbitrumSepolia,
};

function getChainByName(name) {
  const key = String(name || "").toLowerCase();
  const chain = ACCOUNT_KIT_NETWORKS[key];

  if (!chain) {
    throw new Error(
      `Red no soportada: "${name}". Opciones: ${Object.keys(ACCOUNT_KIT_NETWORKS).join(", ")}`
    );
  }

  return chain;
}

function getRpcUrl(chain) {
  return (
    chain?.rpcUrls?.default?.http?.[0] ||
    chain?.rpcUrls?.alchemy?.http?.[0] ||
    null
  );
}

function getExplorerUrl(chain) {
  return chain?.blockExplorers?.default?.url || null;
}

function isL1(chain) {
  return chain.id === 1 || chain.id === 11155111;
}

function normalizeArgs(args = []) {
  return args.map((value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    if (/^\d+$/.test(value)) return BigInt(value);
    return value;
  });
}

function stringifyArgs(args) {
  return JSON.stringify(args, (_, v) =>
    typeof v === "bigint" ? v.toString() : v
  );
}

const selectedChain = getChainByName(values.network);

/*
  Hardhat sigue usando el nombre de red para conectarse.
  Esto asume que en hardhat.config.js existe una red con ese mismo nombre
  o alias compatible.
*/
const HARDHAT_NETWORK_ALIASES = {
  ethereum: "mainnet",
  mainnet: "mainnet",
  sepolia: "sepolia",
  polygon: "polygon",
  amoy: "amoy",
  polygonamoy: "amoy",
  "polygon-amoy": "amoy",
  optimism: "optimism",
  optimismsepolia: "optimismSepolia",
  "optimism-sepolia": "optimismSepolia",
  base: "base",
  basesepolia: "baseSepolia",
  "base-sepolia": "baseSepolia",
  arbitrum: "arbitrum",
  arbitrumsepolia: "arbitrumSepolia",
  "arbitrum-sepolia": "arbitrumSepolia",
};

process.env.HARDHAT_NETWORK =
  HARDHAT_NETWORK_ALIASES[String(values.network).toLowerCase()] ?? values.network;

const hreModule = await import("hardhat");
const hre = hreModule.default;

async function getConnection() {
  const connection = await hre.network.connect();

  if (!connection.ethers) {
    throw new Error("El plugin hardhat-ethers no está disponible en la conexión");
  }

  return connection;
}

async function getDeployer(ethers) {
  const signers = await ethers.getSigners();

  if (!signers || signers.length === 0) {
    throw new Error(
      "No hay cuentas configuradas para esta red. Revisa PRIVATE_KEY y accounts en hardhat.config.js"
    );
  }

  return signers[0];
}

async function deploy(contractName, constructorArgs) {
  const connection = await getConnection();
  const { ethers } = connection;

  const deployer = await getDeployer(ethers);
  const factory = await ethers.getContractFactory(contractName, deployer);
  const contract = await factory.deploy(...constructorArgs);

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const network = await ethers.provider.getNetwork();
  const deployerAddress = await deployer.getAddress();

  console.log(`mode=deploy`);
  console.log(`network=${selectedChain.name ?? values.network}`);
  console.log(`hardhatNetwork=${process.env.HARDHAT_NETWORK}`);
  console.log(`chainId=${selectedChain.id.toString()}`);
  console.log(`providerChainId=${network.chainId.toString()}`);
  console.log(`chainType=${isL1(selectedChain) ? "l1" : "l2"}`);
  console.log(`rpcUrl=${getRpcUrl(selectedChain) ?? ""}`);
  console.log(`explorer=${getExplorerUrl(selectedChain) ?? ""}`);
  console.log(`deployer=${deployerAddress}`);
  console.log(`contract=${contractName}`);
  console.log(`address=${address}`);
  console.log(`constructorArgs=${stringifyArgs(constructorArgs)}`);
}

async function verify(address, constructorArgs) {
  const connection = await getConnection();
  const { ethers } = connection;
  const network = await ethers.provider.getNetwork();

  await verifyContract(
    {
      address,
      constructorArgs,
      provider: "etherscan",
    },
    hre
  );

  console.log(`mode=verify`);
  console.log(`network=${selectedChain.name ?? values.network}`);
  console.log(`hardhatNetwork=${process.env.HARDHAT_NETWORK}`);
  console.log(`chainId=${selectedChain.id.toString()}`);
  console.log(`providerChainId=${network.chainId.toString()}`);
  console.log(`chainType=${isL1(selectedChain) ? "l1" : "l2"}`);
  console.log(`rpcUrl=${getRpcUrl(selectedChain) ?? ""}`);
  console.log(`explorer=${getExplorerUrl(selectedChain) ?? ""}`);
  console.log(`address=${address}`);
  console.log(`constructorArgs=${stringifyArgs(constructorArgs)}`);
  console.log(`verified=true`);
}

const constructorArgs = normalizeArgs(values.arg ?? []);

if (mode === "deploy") {
  if (!values.contract) {
    console.error("Falta --contract <Contrato>");
    process.exit(1);
  }

  await deploy(values.contract, constructorArgs);
}

if (mode === "verify") {
  if (!values.address) {
    console.error("Falta --address <0x...>");
    process.exit(1);
  }

  await verify(values.address, constructorArgs);
}