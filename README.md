# evm-userop-relay

A minimal **Node.js / Express** API that:

1. Receives a `POST /relay` request.
2. Takes the **raw body** (JSON, plain text, or hex) and converts it to EVM calldata.
3. Submits it as a **sponsored ERC-4337 UserOperation** using the **Alchemy Gas Manager** (gas tank), so end-users pay zero gas.

---

## Architecture

```
POST /relay
  │
  ├─ resolveCalldata()   ← converts body → 0x-hex
  │
  └─ submitUserOperation()
        │
        ├─ createModularAccountAlchemyClient()  ← @alchemy/aa-alchemy
        │       signer: LocalAccountSigner (EOA private key)
        │       gasManagerConfig.policyId       ← gas tank / paymaster
        │
        └─ client.sendUserOperation({ target, data: calldata, value: 0n })
              │
              └─ Alchemy Bundler → EntryPoint (on-chain) → Target contract
```

---

## Prerequisites

| What | Where |
|---|---|
| Alchemy API key | <https://dashboard.alchemy.com> |
| Gas Manager Policy ID | Dashboard → Gas Manager → New policy |
| EOA private key (signer) | MetaMask export / `cast wallet new` |
| Target contract address | Your deployed EVM contract |

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/jota-ele-ene/evm-userop-relay.git
cd evm-userop-relay

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env with your keys

# 4. Run
npm start
# or for dev (auto-reload)
npm run dev
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ALCHEMY_API_KEY` | ✅ | Your Alchemy project API key |
| `ALCHEMY_GAS_POLICY_ID` | ✅ | Gas Manager policy ID (enables sponsored gas) |
| `OWNER_PRIVATE_KEY` | ✅ | Private key of the EOA that owns the smart account |
| `TARGET_CONTRACT_ADDRESS` | ✅ | Contract address that will receive the calldata |
| `NETWORK` | ✅ | `sepolia` \| `polygon` \| `base` \| `optimism` \| `arbitrum` \| `mainnet` |
| `PORT` | ❌ | HTTP port (default `3000`) |

---

## API

### `POST /relay`

Sends the request body as calldata inside a **gas-sponsored UserOperation**.

#### Body formats supported

| Content-Type | Behavior |
|---|---|
| `application/json` | JSON is `JSON.stringify`-d then hex-encoded as UTF-8 |
| `text/plain` | String is hex-encoded as UTF-8 |
| `application/octet-stream` | Raw bytes sent as-is |
| Any string starting with `0x` | Treated as already-encoded hex calldata |

#### Response `202 Accepted`

```json
{
  "status": "submitted",
  "userOpHash": "0xabc...",
  "txHash": "0xdef..."   // null if not yet mined when we respond
}
```

#### Example – JSON body

```bash
curl -X POST http://localhost:3000/relay \
  -H 'Content-Type: application/json' \
  -d '{"action":"store","value":42}'
```

#### Example – raw hex calldata

```bash
curl -X POST http://localhost:3000/relay \
  -H 'Content-Type: text/plain' \
  -d '0x60fe47b10000000000000000000000000000000000000000000000000000000000000001'
```

### `GET /health`

Returns `{ "ok": true }` – useful for load-balancer checks.

---

## How the Gas Tank Works

The Alchemy **Gas Manager** acts as an ERC-4337 Paymaster:

1. You deposit ETH into your Gas Manager policy in the Alchemy dashboard.
2. The policy is attached to the `createModularAccountAlchemyClient` client.
3. When `sendUserOperation` is called, the SDK hits `alchemy_requestGasAndPaymasterAndData`, which returns signed `paymaster + paymasterData`.
4. The Bundler sends the `UserOperation` to the on-chain `EntryPoint`. The Paymaster contract pays the gas out of your deposited balance.
5. The end-user pays **zero gas**.

---

## Security Notes

- **Never commit `.env`** – it is in `.gitignore`.
- The `OWNER_PRIVATE_KEY` controls the smart account. Use a **dedicated key** with minimal balance.
- Add rate-limiting or an API key header to `POST /relay` in production to avoid draining your gas tank.
- For production, use a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.) instead of a `.env` file.
