# evm-userop-relay

Node.js API that receives structured JSON payloads and submits them as an ERC-4337 sponsored UserOperation via Alchemy Gas Manager to a contract function:

```solidity
registerRecord((string title,string body,string category,uint256 createdAt,bytes32 externalId))
```

The backend serves a static frontend from `front/` and exposes a REST endpoint for submitting the payload.

## Configuration

Configure the relay using environment variables or CI secrets (the service reads configuration from the process environment at runtime). Required variables used by the relay and supporting scripts:

- `ALCHEMY_API_KEY`
- `ALCHEMY_GAS_POLICY_ID`
- `OWNER_PRIVATE_KEY` (private key used by the relayer signer)
- `TARGET_CONTRACT_ADDRESS` (optional default contract address; can be overridden per-request)
- `ETHERSCAN_API_KEY` (used to fetch ABIs from explorers)
- `PORT` (optional, defaults to `3000`)

RPC and explorer configuration for deployment scripts may be provided as network-scoped variables (for example `SEPOLIA_RPC_URL`, `SEPOLIA_PRIVATE_KEY`). Provide these via your CI/host secret manager when deploying.

The relay selects the active network from the frontend or request payload. Supported networks are provided by the `@account-kit/infra` SDK and exposed via the backend `GET /api/networks` endpoint.

Supported network IDs (keys exposed by the API):

- `ethereum` (alias for `mainnet`)
- `sepolia`
- `polygon`
- `amoy` (alias for Polygon Amoy)
- `base`
- `optimism`
- `arbitrum`
- `mainnet`

These correspond to the chain objects exported by `@account-kit/infra` and include `rpcUrls`, `blockExplorers`, `name`, and `id` metadata returned by `GET /api/networks`.

## Install

```bash
npm install
```

## Run

Start the backend and serve the static frontend:

```bash
node src/index.js
```

Then open `http://localhost:3000` in your browser.

## Deployment

The project supports deploy + verify using `scripts/deploy.js`. You have to compile your smart contract before.

If you have to compile:

```bash
npx hardhat compile
```

Once you got the artifacts for your contract at `/artifacts/contracts`, you can deploy it:

```bash
node scripts/deploy.js deploy --network sepolia --contract JsonRegistry 
```

## Verify contract

If you want to verify:

```bash
node scripts/deploy.js verify --network sepolia --address 0x......
```

## API Endpoints

The backend exposes these endpoints:

- `GET /api/networks` — lists supported networks and their RPC/explorer URLs.
- `GET /api/contract-abi?address=<address>&network=<id>` — fetches contract ABI from the selected network explorer and returns non-view functions.
- `POST /api/validate-input-json/:network/:contractAddress/:functionSignature` — validates and normalizes a JSON body to match a function's tuple input and returns `calldata` and normalized args.
- `POST /api/submit-json/:network/:contractAddress/:functionSignature` — validates a JSON body, encodes calldata and submits an ERC-4337 UserOperation using the relayer.
- `POST /api/submit` — accepts `{ contractAddress, functionSignature, args, network }` and submits a UserOperation (expects `args` already encoded as JS values matching the ABI).

The static UI is served from `front/index.html`. The frontend fields include `network`, `title`, `body`, and `category` when using the provided UI.

## Payload format

The API expects a JSON object with at least:

```json
{
  "title": "Acta 0001",
  "body": "Este es el contenido que quiero registrar",
  "category": "registro"
}
```

Both `title` and `body` are required.

Optional fields:

- `createdAt` (unix timestamp)
- `externalId` (bytes32 hex string)

If `createdAt` is omitted, the server sets the current timestamp.
If `externalId` is omitted, it is derived from the JSON payload.

## Example with curl

Submit using `POST /api/submit` with pre-encoded `args`:

```bash
curl -X POST http://localhost:3000/api/submit \
  -H 'Content-Type: application/json' \
  -d '{
    "network": "sepolia",
    "contractAddress": "0xYourTargetContractAddress",
    "functionSignature": "registerRecord((string,string,string,uint256,bytes32))",
    "args": [{
      "title": "Acta 0001",
      "body": "Texto de prueba",
      "category": "registro",
      "createdAt": 1680000000,
      "externalId": "0x0123..."
    }]
  }'
```

Or validate JSON and obtain calldata before submitting:

```bash
curl -X POST http://localhost:3000/api/validate-input-json/sepolia/0xYourTargetContractAddress/registerRecord((string,string,string,uint256,bytes32)) \
  -H 'Content-Type: application/json' \
  -d '{ "title":"Acta 0001","body":"Texto","category":"registro","createdAt":1680000000,"externalId":"0x0123..." }'
```

## Response

The API returns JSON with the submission result:

```json
{
  "status": "ok",
  "result": {
    "hash": "0x...",
    "txHash": "0x...",
    "calldata": "0x...",
    "record": {
      "title": "Acta 0001",
      "body": "Texto de prueba",
      "category": "registro",
      "createdAt": "...",
      "externalId": "0x..."
    }
  },
  "explorerBaseUrl": "https://sepolia.etherscan.io/tx/"
}
```

## Notes

- Gas sponsorship depends on your Alchemy Gas Manager policy.
- Make sure the target contract is deployed and verified on the selected network.
- The backend relays the call to the configured contract address rather than deploying the contract itself.
