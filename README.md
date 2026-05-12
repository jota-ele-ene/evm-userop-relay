# evm-userop-relay

Node.js API that receives a JSON payload and submits it as an ERC-4337 sponsored UserOperation via Alchemy Gas Manager to a verified contract function:

```solidity
registerRecord((string title,string body,string category,uint256 createdAt,bytes32 externalId))
```

This layout is meant for Sepolia explorers to decode the input by fields once the target contract is verified.

## Environment

Copy `.env.example` to `.env` and fill in:

- `ALCHEMY_API_KEY`
- `ALCHEMY_GAS_POLICY_ID`
- `OWNER_PRIVATE_KEY`
- `TARGET_CONTRACT_ADDRESS`
- `SEPOLIA_RPC_URL`
- `ETHERSCAN_API_KEY`
- `DEPLOYER_PRIVATE_KEY`
- `NETWORK=sepolia`
- `PORT=3000`

`OWNER_PRIVATE_KEY` is used by the relay API. `DEPLOYER_PRIVATE_KEY` is used by the contract deployment script.

## Install

```bash
npm install
```

## Deploy

The repo includes two deployment options:

- `npm run deploy` — deploy using Hardhat and `scripts/deploy.js`
- `npm run deploy-manual` — deploy directly with Viem using `scripts/deploy-manual.js`

After deployment, update `TARGET_CONTRACT_ADDRESS` in `.env` with the new contract address.

## Verify contract

To verify on Etherscan after deployment, run:

```bash
npm run verify:sepolia -- <DEPLOYED_CONTRACT_ADDRESS>
```

For example:

```bash
npm run verify:sepolia -- 0x1234...abcd
```

## Run

```bash
npm run dev
```

## Routes

### `GET /`
Serves an HTML form with a textarea where you can paste JSON.

### `POST /relay`
Accepts either:
- `application/x-www-form-urlencoded` with field `payload`
- `application/json` with a JSON object body
- raw text containing JSON

Expected JSON shape:

```json
{
  "title": "Acta 0001",
  "body": "Este es el contenido que quiero registrar",
  "category": "registro",
  "createdAt": 1746995760,
  "externalId": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

`title` and `body` are required.

If `createdAt` is omitted, the server sets the current unix timestamp.
If `externalId` is omitted, the server derives a `bytes32` value from the JSON content.

### Example with curl

```bash
curl -X POST http://localhost:3000/relay \
  -H 'Content-Type: application/json' \
  -d '{
    "title":"Acta 0001",
    "body":"Texto de prueba",
    "category":"registro"
  }'
```

## Response

```json
{
  "status": "submitted",
  "userOpHash": "0x...",
  "txHash": "0x...",
  "explorerUrl": "https://sepolia.etherscan.io/tx/0x..."
}
```

## Notes

- Gas sponsorship depends on your Alchemy Gas Manager policy.
- The target contract should be verified in Sepolia Etherscan so its ABI can decode tuple fields.
- The repo does not deploy the contract; it relays the call to an already deployed contract.