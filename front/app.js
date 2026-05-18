const form = document.querySelector("#payloadForm");
const responseContainer = document.querySelector("#response");
const contractAddressInput = document.querySelector("#contractAddress");
const functionSelect = document.querySelector("#functionSelect");
const functionFields = document.querySelector("#functionFields");
const networkSelect = document.querySelector("#network");
const abiStatus = document.querySelector("#abiStatus");
const tupleJsonField = document.querySelector("#tupleJson");
const validateJsonButton = document.querySelector("#validateJsonButton");
const submitJsonButton = document.querySelector("#submitJsonButton");

let availableFunctions = [];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderResponse(html) {
  responseContainer.innerHTML = html;
}

function setAbiStatus(message, isError = false) {
  abiStatus.textContent = message;
  abiStatus.style.color = isError ? "#b00020" : "#555";
}

function setActionButtonsEnabled(enabled) {
  validateJsonButton.disabled = !enabled;
  submitJsonButton.disabled = !enabled;
}

function clearFunctionInputs() {
  functionFields.innerHTML = "";
  functionSelect.innerHTML =
    '<option value="" disabled selected>Introduce dirección y red</option>';
  functionSelect.disabled = true;
  setActionButtonsEnabled(false);
}

function renderFunctionInputs(inputs) {
  if (!inputs || inputs.length === 0) {
    functionFields.innerHTML =
      "<p class='hint'>Esta función no tiene parámetros de entrada.</p>";
    setActionButtonsEnabled(true);
    return;
  }

  functionFields.innerHTML = inputs
    .map((input, index) => {
      const label = input.name || `arg${index}`;
      return `
        <div class="hint">
          <strong>${escapeHtml(label)}</strong> (${escapeHtml(input.type)})
        </div>
      `;
    })
    .join("");

  setActionButtonsEnabled(true);
}

function renderFunctionOptions(functions) {
  functionSelect.innerHTML = functions
    .map(
      (fn) =>
        `<option value="${escapeHtml(fn.signature)}">${escapeHtml(
          fn.signature
        )}</option>`
    )
    .join("");

  functionSelect.disabled = false;
  handleFunctionSelect();
}

function getBaseType(type) {
  return String(type || "").replace(/\[[^\]]*\]/g, "");
}

function getArrayDepth(type) {
  const matches = String(type || "").match(/\[[^\]]*\]/g);
  return matches ? matches.length : 0;
}

function getExampleValue(input, depth = 0) {
  const type = input?.type || "";
  const baseType = getBaseType(type);
  const arrayDepth = getArrayDepth(type);

  if (arrayDepth > depth) {
    return [
      getExampleValue(
        { ...input, type: type.replace(/\[[^\]]*\]/, "") },
        depth + 1
      ),
    ];
  }

  if (baseType === "tuple") {
    const components = input.components || [];
    return Object.fromEntries(
      components.map((component, index) => [
        component.name || `field${index}`,
        getExampleValue(component),
      ])
    );
  }

  if (baseType === "address") return "0x0000000000000000000000000000000000000000";
  if (baseType === "bool") return true;
  if (baseType === "string") return "";
  if (baseType === "bytes") return "0x";
  if (/^bytes\d+$/.test(baseType)) {
    const size = Number(baseType.replace("bytes", ""));
    return `0x${"00".repeat(size)}`;
  }
  if (baseType.startsWith("uint") || baseType.startsWith("int")) return "0";

  return "";
}

function getTuplePlaceholder(input) {
  return JSON.stringify(getExampleValue(input), null, 2);
}

function renderInputHelp(input) {
  if (!input.type.includes("tuple")) {
    return "";
  }

  const components = input.components || [];
  const fields = components.length
    ? components
        .map((component, index) => {
          const name = escapeHtml(component.name || `field${index}`);
          const type = escapeHtml(component.type || "unknown");
          return `<li><code>${name}</code>: ${type}</li>`;
        })
        .join("")
    : "<li>Sin metadatos de components en el ABI.</li>";

  return `
    <div class="hint tuple-help">
      <p>Rellena el textarea inferior como JSON válido.</p>
      <ul>${fields}</ul>
    </div>
  `;
}

function getSelectedFunction() {
  return availableFunctions.find((fn) => fn.signature === functionSelect.value);
}

function selectedFunctionSupportsJsonFlow(fn) {
  if (!fn) return false;
  const inputs = fn.inputs || [];

  return (
    inputs.length === 0 ||
    (inputs.length === 1 &&
      (inputs[0].type === "tuple" || inputs[0].type.startsWith("tuple[")))
  );
}

function updateTupleJsonForSelectedFunction(fn) {
  if (!fn) {
    tupleJsonField.value = "";
    return;
  }

  const inputs = fn.inputs || [];

  if (inputs.length === 0) {
    tupleJsonField.value = "{}";
    return;
  }

  if (inputs.length === 1 && (inputs[0].type === "tuple" || inputs[0].type.startsWith("tuple["))) {
    tupleJsonField.value = getTuplePlaceholder(inputs[0]);
    return;
  }

  tupleJsonField.value = "";
}

function buildJsonEndpoint(action) {
  const network = encodeURIComponent(networkSelect.value);
  const contractAddress = encodeURIComponent(contractAddressInput.value.trim());
  const functionSignature = encodeURIComponent(functionSelect.value);

  return `api/${action}/${network}/${contractAddress}/${functionSignature}`;
}

function getTupleJsonBody() {
  const raw = tupleJsonField.value.trim();

  if (!raw) {
    throw new Error("El campo Input JSON está vacío.");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("El campo Input JSON no contiene un JSON válido.");
  }
}

async function postJsonAction(action) {
  const contractAddress = contractAddressInput.value.trim();
  const network = networkSelect.value;
  const selectedFunction = getSelectedFunction();

  if (!contractAddress) {
    renderResponse("<p>Introduce una dirección de contrato válida.</p>");
    return;
  }

  if (!network) {
    renderResponse("<p>Selecciona una red antes de continuar.</p>");
    return;
  }

  if (!selectedFunction) {
    renderResponse("<p>Selecciona una función válida del contrato.</p>");
    return;
  }

  if (!selectedFunctionSupportsJsonFlow(selectedFunction)) {
    renderResponse(
      "<p>Esta función no es compatible con el flujo JSON. Debe tener cero parámetros o un único parámetro tuple / tuple[].</p>"
    );
    return;
  }

  let body;
  try {
    body = getTupleJsonBody();
  } catch (error) {
    renderResponse(`<p>${escapeHtml(error.message)}</p>`);
    return;
  }

  const loadingText =
    action === "validate-input-json"
      ? "<p>Validando JSON...</p>"
      : "<p>Enviando UserOperation...</p>";

  renderResponse(loadingText);

  validateJsonButton.disabled = true;
  submitJsonButton.disabled = true;

  try {
    const response = await fetch(buildJsonEndpoint(action), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Error inesperado");
    }

    if (action === "validate-input-json") {
      renderResponse(`
        <h2>JSON válido</h2>
        <p><strong>Función:</strong> ${escapeHtml(data.function?.name || "")}</p>
        <p><strong>Contrato:</strong> ${escapeHtml(contractAddress)}</p>
        <h3>Args normalizados</h3>
        <pre>${escapeHtml(JSON.stringify(data.normalizedArgs, null, 2))}</pre>
        <h3>Calldata</h3>
        <pre>${escapeHtml(data.calldata || "")}</pre>
      `);
      return;
    }

    const userOpUrl = data.explorer?.userOpUrl;
    const txUrl = data.explorer?.txUrl;
    const contractUrl = data.explorer?.contractUrl;

    renderResponse(`
      <h2>UserOperation enviada</h2>

      <p>
        <strong>UO Hash:</strong>
        ${
          data.result?.hash
            ? (
                userOpUrl
                  ? `<a href="${escapeHtml(userOpUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.result.hash)}</a>`
                  : escapeHtml(data.result.hash)
              )
            : "N/D"
        }
      </p>

      <p>
        <strong>Tx Hash:</strong>
        ${
          data.result?.txHash
            ? (
                txUrl
                  ? `<a href="${escapeHtml(txUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(data.result.txHash)}</a>`
                  : escapeHtml(data.result.txHash)
              )
            : "Pendiente"
        }
      </p>

      <p>
        <strong>Contrato:</strong>
        ${
          contractUrl
            ? `<a href="${escapeHtml(contractUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(contractAddress)}</a>`
            : escapeHtml(contractAddress)
        }
      </p>

      <h3>Validación</h3>
      <pre>${escapeHtml(JSON.stringify(data.validation, null, 2))}</pre>

      <h3>Resultado</h3>
      <pre>${escapeHtml(JSON.stringify(data.result, null, 2))}</pre>
    `);
  } catch (error) {
    renderResponse(`
      <h2>Error</h2>
      <pre>${escapeHtml(error.message)}</pre>
    `);
  } finally {
    setActionButtonsEnabled(true);
  }
}

async function loadNetworks() {
  try {
    const response = await fetch("api/networks", { cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }

    if (!contentType.includes("application/json")) {
      const text = await response.text();
      throw new Error(
        `Expected JSON from api/networks but got ${contentType}: ${text}`
      );
    }

    const data = await response.json();

    if (!data.networks) {
      throw new Error(data.message || "No se pudo cargar la lista de redes.");
    }

    networkSelect.innerHTML = [
      '<option value="" disabled selected>Selecciona una red</option>',
      ...data.networks.map(
        (network) =>
          `<option value="${escapeHtml(network.id)}">${escapeHtml(
            `${network.id} (${network.chainId})`
          )}</option>`
      ),
    ].join("");
  } catch (error) {
    renderResponse(`<p>Error cargando redes: ${escapeHtml(error.message)}</p>`);
  }
}

async function loadContractAbi() {
  const contractAddress = contractAddressInput.value.trim();
  const network = networkSelect.value;

  clearFunctionInputs();
  tupleJsonField.value = "";

  if (!contractAddress || !network) {
    setAbiStatus(
      "Introduce la dirección del contrato y selecciona una red para cargar ABI."
    );
    return;
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
    setAbiStatus("Dirección de contrato inválida.", true);
    return;
  }

  setAbiStatus("Cargando ABI del contrato...");

  try {
    const response = await fetch(
      `api/contract-abi?address=${encodeURIComponent(
        contractAddress
      )}&network=${encodeURIComponent(network)}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    availableFunctions = data.functions || [];

    if (availableFunctions.length === 0) {
      throw new Error("No se encontraron funciones no constantes en el ABI.");
    }

    renderFunctionOptions(availableFunctions);
    setAbiStatus("ABI cargado. Selecciona la función para revisar o editar el JSON.");
  } catch (error) {
    setAbiStatus(error.message, true);
    renderResponse(`<p>Error cargando ABI: ${escapeHtml(error.message)}</p>`);
  }
}

function handleFunctionSelect() {
  const selectedFunction = getSelectedFunction();

  if (!selectedFunction) {
    clearFunctionInputs();
    tupleJsonField.value = "";
    return;
  }

  renderFunctionInputs(selectedFunction.inputs);

  const supportsJson = selectedFunctionSupportsJsonFlow(selectedFunction);

  if (!supportsJson) {
    functionFields.innerHTML += `
      <div class="hint tuple-help">
        <p>Esta función no entra en el flujo JSON simplificado.</p>
        <ul>
          <li>Debe tener cero parámetros, o un único parámetro <code>tuple</code> o <code>tuple[]</code>.</li>
        </ul>
      </div>
    `;
    tupleJsonField.value = "";
    setActionButtonsEnabled(false);
    return;
  }

  if (
    selectedFunction.inputs?.length === 1 &&
    selectedFunction.inputs[0].type.includes("tuple")
  ) {
    functionFields.innerHTML += renderInputHelp(selectedFunction.inputs[0]);
  }

  updateTupleJsonForSelectedFunction(selectedFunction);
  setActionButtonsEnabled(true);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
});

contractAddressInput.addEventListener("blur", loadContractAbi);
networkSelect.addEventListener("change", loadContractAbi);
functionSelect.addEventListener("change", handleFunctionSelect);

validateJsonButton.addEventListener("click", () => {
  postJsonAction("validate-input-json");
});

submitJsonButton.addEventListener("click", () => {
  postJsonAction("submit-json");
});

setActionButtonsEnabled(false);
loadNetworks();