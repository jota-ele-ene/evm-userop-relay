import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { encodeFunctionData } from "viem";

import { submitUserOperation } from "./userOperation.js";
import { submitDirectTransaction } from "./directTransaction.js";
import {
  NETWORKS,
  getChain,
  getRpcUrl,
  getExplorerBaseUrl,
  getExplorerApiUrl,
  buildExplorerTxUrl,
  buildExplorerAddressUrl,
  buildExplorerUserOpUrl,
  isV2ExplorerApi,
} from "./chains.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontDir = path.join(__dirname, "../front");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function isAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || ""));
}

function serializeBigInt(value) {
  return JSON.parse(
    JSON.stringify(value, (_, item) =>
      typeof item === "bigint" ? item.toString() : item
    )
  );
}

function extractModeAndInputJson(body, queryMode) {
  const safeBody = body || {};
  const mode = safeBody.mode || queryMode || "userop";

  if (
    safeBody.json &&
    typeof safeBody.json === "object" &&
    !Array.isArray(safeBody.json)
  ) {
    return {
      mode,
      inputJson: safeBody.json,
    };
  }

  const { mode: _mode, ...inputJson } = safeBody;
  return {
    mode,
    inputJson,
  };
}

async function submitCall(
  { contractAddress, functionSignature, args, calldata },
  network,
  mode
) {
  if (mode === "direct") {
    return await submitDirectTransaction(
      {
        contractAddress,
        functionSignature,
        args,
        calldata,
      },
      network
    );
  }

  return await submitUserOperation(
    {
      contractAddress,
      functionSignature,
      args,
      calldata,
    },
    network
  );
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

  const abi =
    typeof data.result === "string" ? JSON.parse(data.result) : data.result;

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

function abiInputToSignatureType(input) {
  if (!input || !input.type) return "";

  if (input.type === "tuple") {
    const inner = (input.components || [])
      .map(abiInputToSignatureType)
      .join(",");
    return `(${inner})`;
  }

  if (input.type === "tuple[]") {
    const inner = (input.components || [])
      .map(abiInputToSignatureType)
      .join(",");
    return `(${inner})[]`;
  }

  if (input.type.startsWith("tuple[")) {
    const suffix = input.type.slice("tuple".length);
    const inner = (input.components || [])
      .map(abiInputToSignatureType)
      .join(",");
    return `(${inner})${suffix}`;
  }

  return input.type;
}

function getCanonicalFunctionSignature(fn) {
  return `${fn.name}(${(fn.inputs || [])
    .map(abiInputToSignatureType)
    .join(",")})`;
}

function formatAbiFunctions(abi) {
  if (!Array.isArray(abi)) {
    throw new Error("ABI must be an array");
  }

  return abi
    .filter((item) => item.type === "function")
    .filter(
      (item) =>
        item.stateMutability !== "view" && item.stateMutability !== "pure"
    )
    .map((fn) => ({
      name: fn.name,
      signature: getCanonicalFunctionSignature(fn),
      inputs: fn.inputs.map(normalizeAbiInput),
    }));
}

function getFunctionFromAbi(abi, functionName) {
  const functions = abi.filter(
    (item) => item.type === "function" && item.name === functionName
  );

  console.log("[requested functionName]", functionName);
  console.log(
    "[available matches]",
    functions.map(getCanonicalFunctionSignature)
  );

  if (functions.length === 0) {
    const available = abi
      .filter((item) => item.type === "function")
      .map(getCanonicalFunctionSignature);

    throw new Error(
      `Function ${functionName} not found in contract ABI. Available: ${available.join(
        " | "
      )}`
    );
  }

  if (functions.length > 1) {
    const matches = functions.map(getCanonicalFunctionSignature);
    throw new Error(
      `Function ${functionName} is overloaded. Use full signature. Matches: ${matches.join(
        " | "
      )}`
    );
  }

  return functions[0];
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

      if (!(key in value)) {
        throw new Error(
          `Missing field "${key}" in tuple "${
            input.name || "tuple"
          }". Received keys: ${Object.keys(value).join(", ")}`
        );
      }

      return normalizeJsonArgForInput(component, value[key]);
    });
  }

  if (type.startsWith("tuple[")) {
    if (!Array.isArray(value)) {
      throw new Error(
        `Field "${input.name || type}" must be an array of objects`
      );
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

async function buildValidatedCall({
  network,
  contractAddress,
  functionName,
  inputJson,
}) {
  if (!network) {
    throw new Error('Path param "network" is required');
  }

  if (!contractAddress || !isAddress(contractAddress)) {
    throw new Error('Path param "contractAddress" must be a valid address');
  }

  if (!functionName) {
    throw new Error('Path param "functionName" is required');
  }

  const abi = await fetchContractAbi(network, contractAddress);
  const functionAbi = getFunctionFromAbi(abi, functionName);
  const inputs = functionAbi.inputs || [];
  const functionSignature = getCanonicalFunctionSignature(functionAbi);

  let args;

  if (inputs.length === 0) {
    args = [];
  } else if (inputs.length === 1 && inputs[0].type === "tuple") {
    args = [normalizeJsonArgForInput(inputs[0], inputJson)];
  } else if (inputs.length === 1 && inputs[0].type.startsWith("tuple[")) {
    args = [normalizeJsonArgForInput(inputs[0], inputJson)];
  } else {
    throw new Error(
      "This endpoint only accepts functions with one tuple or tuple[] input"
    );
  }

  const calldata = encodeFunctionData({
    abi: [functionAbi],
    functionName: functionAbi.name,
    args,
  });

  console.log("[buildValidatedCall.calldata]", calldata);
  console.log("[buildValidatedCall.args]", args);
  console.log("[buildValidatedCall.functionAbi]", functionAbi);

  return {
    abi,
    functionAbi,
    functionSignature,
    args,
    calldata,
  };
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

app.post(
  "/api/validate-input-json/:network/:contractAddress/:functionName",
  async (req, res) => {
    try {
      const { network, contractAddress, functionName } = req.params;
      const { inputJson } = extractModeAndInputJson(req.body, req.query.mode);

      console.log("[validate-input-json] req.body =", req.body);

      const validated = await buildValidatedCall({
        network,
        contractAddress,
        functionName,
        inputJson,
      });

      return res.json({
        status: "ok",
        network,
        contractAddress,
        functionName,
        functionSignature: validated.functionSignature,
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
  }
);

app.post(
  "/api/submit-json/:network/:contractAddress/:functionName",
  async (req, res) => {
    try {
      const { network, contractAddress, functionName } = req.params;
      const { mode, inputJson } = extractModeAndInputJson(req.body, req.query.mode);

      console.log("[submit-json] req.body =", req.body);

      const validated = await buildValidatedCall({
        network,
        contractAddress,
        functionName,
        inputJson,
      });

      console.log("[submit-json.validated]", {
        functionSignature: validated.functionSignature,
        calldata: validated.calldata,
        args: validated.args,
      });

      const result = await submitCall(
        {
          contractAddress,
          functionSignature: validated.functionSignature,
          args: validated.args,
          calldata: validated.calldata,
        },
        network,
        mode
      );

      const explorerBaseUrl = getExplorerBaseUrl(network);
      const txUrl = buildExplorerTxUrl(network, result.txHash);
      const contractUrl = buildExplorerAddressUrl(network, contractAddress);
      const userOpUrl = buildExplorerUserOpUrl(
        network,
        result.hash ?? result.txHash
      );

      console.log("[submit-json/explorer]", {
        mode,
        network,
        baseUrl: explorerBaseUrl,
        txHash: result.txHash,
        txUrl,
        contractAddress,
        contractUrl,
        userOpHash: result.hash ?? result.txHash,
        userOpUrl,
      });

      return res.json({
        status: "ok",
        mode,
        network,
        contractAddress,
        functionName,
        functionSignature: validated.functionSignature,
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
  }
);

app.post("/api/submit", async (req, res) => {
  try {
    const {
      contractAddress,
      functionSignature,
      args,
      network,
      mode = "userop",
      calldata,
    } = req.body || {};

    const result = await submitCall(
      {
        contractAddress,
        functionSignature,
        args,
        calldata,
      },
      network,
      mode
    );

    const explorerBaseUrl = getExplorerBaseUrl(network);
    const txUrl = buildExplorerTxUrl(network, result.txHash);
    const contractUrl = buildExplorerAddressUrl(network, contractAddress);
    const userOpUrl = buildExplorerUserOpUrl(
      network,
      result.hash ?? result.txHash
    );

    res.json({
      status: "ok",
      mode,
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