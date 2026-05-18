# evm-userop-relay

Node.js API that receives structured JSON payloads and submits them as an ERC-4337 sponsored UserOperation via Alchemy Gas Manager to a contract function:

```solidity
registerRecord((string title,string body,string category,uint256 createdAt,bytes32 externalId))
```

The backend serves a static frontend from `front/` and exposes a REST endpoint for submitting the payload.

## Environment

Copy `.env.example` to `.env` and fill in your values.

Required global values:

- `ALCHEMY_API_KEY`
- `ALCHEMY_GAS_POLICY_ID`
- `OWNER_PRIVATE_KEY`
- `TARGET_CONTRACT_ADDRESS`
- `ETHERSCAN_API_KEY`
- `PORT`

The relay selects the active network from the frontend dropdown. Supported networks are provided by `@account-kit/infra` and exposed via the backend `/api/networks` endpoint.

The relay uses a single `ALCHEMY_API_KEY` and `ALCHEMY_GAS_POLICY_ID` for all supported chains. Explorer URLs can be configured via `EXPLORER_BASE_URL` or network-specific environment variables if needed.

Example for Sepolia:

```env
ALCHEMY_API_KEY=your_alchemy_api_key_here
ALCHEMY_GAS_POLICY_ID=your_policy_id_here
EXPLORER_BASE_URL=https://sepolia.etherscan.io/tx/
OWNER_PRIVATE_KEY=your_owner_private_key_here
TARGET_CONTRACT_ADDRESS=0xYourTargetContractAddress
```

Example for Polygon:

```env
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/your_alchemy_api_key_here
POLYGON_EXPLORER_BASE_URL=https://polygonscan.com/tx/
POLYGON_PRIVATE_KEY=your_polygon_private_key_here
```

Deployment scripts still read network-specific RPC and key values from `.env`, but the relay itself no longer uses a global `NETWORK` env variable.

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

The project supports deploy + verify using `scripts/deploy.js`.

```bash
node scripts/deploy.js --network sepolia --contract JsonRegistry --contract-path contracts/JsonRegistry.sol
```

If you want to skip verification:

```bash
node scripts/deploy.js --network sepolia --contract JsonRegistry --contract-path contracts/JsonRegistry.sol --no-verify
```

The script reads RPC and private key values from `.env`, for example `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY`.

## Verify contract

After deployment the script will automatically call Hardhat verify for the selected network using:

```bash
npx hardhat verify --network sepolia --contract contracts/JsonRegistry.sol:JsonRegistry <ADDRESS>
```

## Frontend

The static UI is served from `front/index.html` and submits payloads to:

- `POST /api/submit`

The frontend exposes fields for:

- `network` (selected from the supported networks provided by `@account-kit/infra`)
- `title`
- `body`
- `category`

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

```bash
curl -X POST http://localhost:3000/api/submit \
  -H 'Content-Type: application/json' \
  -d '{
    "network": "sepolia",
    "payload": {
      "title": "Acta 0001",
      "body": "Texto de prueba",
      "category": "registro"
    }
  }'
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
