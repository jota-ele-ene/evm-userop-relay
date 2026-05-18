const form = document.querySelector("#payloadForm");
const responseContainer = document.querySelector("#response");
const contractAddressInput = document.querySelector("#contractAddress");
const functionSelect = document.querySelector("#functionSelect");
const functionFields = document.querySelector("#functionFields");
const networkSelect = document.querySelector("#network");
const abiStatus = document.querySelector("#abiStatus");
const submitButton = document.querySelector("#submitButton");

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

function setSubmitEnabled(enabled) {
  submitButton.disabled = !enabled;
}

function clearFunctionInputs() {
  functionFields.innerHTML = "";
  functionSelect.innerHTML =
    '<option value="" disabled selected>Introduce dirección y red</option>';
  functionSelect.disabled = true;
  setSubmitEnabled(false);
}

function renderFunctionInputs(inputs) {
  if (!inputs || inputs.length === 0) {
    functionFields.innerHTML =
      "<p class='hint'>Esta función no tiene parámetros de entrada.</p>";
    setSubmitEnabled(true);
    return;
  }

  functionFields.innerHTML = inputs
    .map((input, index) => {
      const fieldId = `arg_${index}`;
      const label = input.name || `arg${index}`;
      const needsTextarea =
        input.type.includes("tuple") || input.type.includes("[");

      if (needsTextarea) {
        return `
          <label for="${fieldId}">${escapeHtml(label)} (${escapeHtml(
          input.type
        )})</label>
          <textarea id="${fieldId}" name="${fieldId}" rows="3" placeholder='JSON para ${escapeHtml(
          input.type
        )}' required></textarea>
        `;
      }

      return `
        <label for="${fieldId}">${escapeHtml(label)} (${escapeHtml(
        input.type
      )})</label>
        <input id="${fieldId}" name="${fieldId}" type="text" placeholder="${escapeHtml(
        input.type
      )}" required />
      `;
    })
    .join("");

  setSubmitEnabled(true);
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
  // Pintar automáticamente los campos de la primera función seleccionada
  handleFunctionSelect();
}

function getSelectedFunction() {
  return availableFunctions.find(
    (fn) => fn.signature === functionSelect.value
  );
}

function parseArgValue(type, rawValue) {
  if (!rawValue) {
    throw new Error("Todos los campos del ABI son obligatorios.");
  }

  if (type === "bool") {
    return rawValue.toLowerCase() === "true";
  }

  if (type.startsWith("uint") || type.startsWith("int")) {
    return rawValue;
  }

  if (type === "address") {
    return rawValue;
  }

  if (type.startsWith("bytes") || type === "string") {
    return rawValue;
  }

  if (type.includes("tuple") || type.includes("[")) {
    try {
      return JSON.parse(rawValue);
    } catch {
      throw new Error(`JSON inválido para tipo ${type}`);
    }
  }

  return rawValue;
}

function getFunctionArgs(inputs) {
  return inputs.map((input, index) => {
    const value = document.querySelector(`#arg_${index}`).value.trim();
    return parseArgValue(input.type, value);
  });
}

async function submitPayload(event) {
  event.preventDefault();

  const contractAddress = contractAddressInput.value.trim();
  const network = networkSelect.value;
  const selectedFunction = getSelectedFunction();

  if (!contractAddress) {
    renderResponse("<p>Introduce una dirección de contrato válida.</p>");
    return;
  }

  if (!network) {
    renderResponse("<p>Selecciona una red antes de enviar.</p>");
    return;
  }

  if (!selectedFunction) {
    renderResponse("<p>Selecciona una función válida del contrato.</p>");
    return;
  }

  let args;
  try {
    args = getFunctionArgs(selectedFunction.inputs);
  } catch (error) {
    renderResponse(`<p>${escapeHtml(error.message)}</p>`);
    return;
  }

  renderResponse("<p>Enviando UserOperation...</p>");

  try {
    const response = await fetch("api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contractAddress,
        network,
        functionSignature: selectedFunction.signature,
        args,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Error inesperado");
    }

    const explorerBaseUrl = data.explorerBaseUrl || "";
    renderResponse(`
      <h2>UserOperation enviada</h2>
      <p><strong>UO Hash:</strong> <a href="${escapeHtml(
        explorerBaseUrl + data.result.hash
      )}" target="_blank">${escapeHtml(data.result.hash)}</a></p>
      <p><strong>Tx Hash:</strong> <a href="${escapeHtml(
        explorerBaseUrl + data.result.txHash
      )}" target="_blank">${escapeHtml(data.result.txHash)}</a></p>
      <h3>Resultado</h3>
      <pre>${escapeHtml(JSON.stringify(data.result, null, 2))}</pre>
    `);
  } catch (error) {
    renderResponse(`
      <h2>Error</h2>
      <pre>${escapeHtml(error.message)}</pre>
    `);
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

    networkSelect.innerHTML = data.networks
      .map(
        (network) =>
          `<option value="${escapeHtml(network.id)}">${escapeHtml(
            `${network.id} (${network.chainId})`
          )}</option>`
      )
      .join("");
  } catch (error) {
    renderResponse(`<p>Error cargando redes: ${escapeHtml(error.message)}</p>`);
  }
}

async function loadContractAbi() {
  const contractAddress = contractAddressInput.value.trim();
  const network = networkSelect.value;

  clearFunctionInputs();

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
    setAbiStatus("ABI cargado. Selecciona la función para ver los campos.");
  } catch (error) {
    setAbiStatus(error.message, true);
    renderResponse(`<p>Error cargando ABI: ${escapeHtml(error.message)}</p>`);
  }
}

function handleFunctionSelect() {
  const selectedFunction = getSelectedFunction();
  if (!selectedFunction) {
    clearFunctionInputs();
    return;
  }

  renderFunctionInputs(selectedFunction.inputs);
}

form.addEventListener("submit", submitPayload);
contractAddressInput.addEventListener("blur", loadContractAbi);
networkSelect.addEventListener("change", loadContractAbi);
functionSelect.addEventListener("change", handleFunctionSelect);

loadNetworks();
