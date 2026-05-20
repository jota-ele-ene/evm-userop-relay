// src/directTransaction.js
import { createWalletClient, createPublicClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { NETWORKS, getChain } from "./chains.js"; // o refactorizar getChain a utils.js

export async function submitDirectTransaction(
  { contractAddress, calldata },
  network
) {
  const chain = getChain(network);
  const account = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY);

  const publicClient = createPublicClient({ chain, transport: http() });
  const walletClient = createWalletClient({ account, chain, transport: http() });

  // encodeFunctionData requiere el ABI completo; aquí usarías el ABI cacheado o lo buscas de nuevo
  const txHash = await walletClient.sendTransaction({
    account, 
    to: contractAddress,
    data: calldata
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  return {
    txHash,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
  };
}