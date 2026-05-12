import "dotenv/config";
import express from "express";
import { submitUserOperation } from "./userOperation.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send(`
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Relay AA - JsonRegistry</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 820px;
          margin: 40px auto;
          padding: 0 16px;
          line-height: 1.5;
        }
        form {
          display: grid;
          gap: 12px;
        }
        textarea {
          min-height: 260px;
          padding: 12px;
          font-size: 15px;
          font-family: monospace;
        }
        button {
          width: fit-content;
          padding: 10px 16px;
          cursor: pointer;
        }
        .hint {
          color: #555;
          font-size: 14px;
        }
        code {
          background: #f3f3f3;
          padding: 2px 6px;
          border-radius: 4px;
        }
      </style>
    </head>
    <body>
      <h1>Registrar JSON vía Account Abstraction</h1>
      <p class="hint">
        Pega un objeto JSON con al menos <code>title</code> y <code>body</code>.
      </p>

      <form action="/submit" method="POST">
        <label for="payload">Payload JSON</label>
        <textarea id="payload" name="payload" required>{
  "title": "Mi primer registro",
  "body": "Texto enviado usando Alchemy AA",
  "category": "demo"
}</textarea>
        <button type="submit">Enviar UserOperation</button>
      </form>
    </body>
    </html>
  `);
});

app.post("/submit", async (req, res) => {
  try {
    const { payload } = req.body;
    const result = await submitUserOperation(payload);

    res.send(`
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>UserOperation enviada</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            max-width: 820px;
            margin: 40px auto;
            padding: 0 16px;
            line-height: 1.5;
          }
          pre {
            white-space: pre-wrap;
            word-break: break-word;
            background: #f6f6f6;
            padding: 16px;
            border-radius: 8px;
          }
        </style>
      </head>
      <body>
        <h1>UserOperation enviada</h1>
        <p><strong>UO Hash:</strong> <a href="${process.env.SEPOLIA_EXPLORER_BASE_URL}${result.hash}" target="_blank">${result.hash}</a></p>
        <p><strong>Tx Hash:</strong> <a href="${process.env.SEPOLIA_EXPLORER_BASE_URL}${result.txHash}" target="_blank">${result.txHash}</a> ?? "Pendiente o no disponible todavía"}</p>
        <h2>Record enviado</h2>
        <pre>${escapeHtml(
          JSON.stringify(
            result.record,
            (_, v) => (typeof v === "bigint" ? v.toString() : v),
            2
          )
        )}</pre>
        <p><a href="/">Volver</a></p>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("[relay] error:", error);
    res.status(500).send(`
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Error</title>
      </head>
      <body>
        <h1>Error</h1>
        <pre>${escapeHtml(error?.stack || error?.message || String(error))}</pre>
        <p><a href="/">Volver</a></p>
      </body>
      </html>
    `);
  }
});

app.listen(port, () => {
console.log(`Relay listening on http://localhost:${port}`);
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}