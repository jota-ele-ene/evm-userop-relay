import "dotenv/config";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import fs from "fs";

async function main() {
  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const pk = process.env.DEPLOYER_PRIVATE_KEY;

  if (!rpcUrl) throw new Error("Missing SEPOLIA_RPC_URL");
  if (!pk) throw new Error("Missing DEPLOYER_PRIVATE_KEY");

  const privateKey = pk.startsWith("0x") ? pk : `0x${pk}`;
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });

  const artifact = JSON.parse(
    fs.readFileSync("./artifacts/contracts/JsonRegistry.sol/JsonRegistry.json", "utf8")
  );

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: [],
  });

  console.log("Deployment tx hash:", hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Contract deployed at:", receipt.contractAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});