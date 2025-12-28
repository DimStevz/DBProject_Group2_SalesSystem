/* =========================
   Inventory Management System - Frontend JavaScript
   - Vanilla JavaScript (no external libraries)
   - Session management via cookies
   - Dropdown support for customers and products
   - Role-based UI controls
   ========================= */

"use strict";

/* -------------------------
   CONFIGURATION
   ------------------------- */
const CONFIG = {
  apiBase: "/api",
  loginUrl: "/api/login",
  meUrl: "/api/me",
  resources: {
    users: "/users",
    products: "/products",
    categories: "/categories",
    customers: "/customers",
    sales: "/sales",
    logs: "/logs",
  },
  fetchDefaults: {
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  },
};

/* -------------------------
   APPLICATION STATE
   ------------------------- */
let STATE = {
  currentUser: null,
  currentView: "dashboard",
  lastFetched: {},
  customers: [],
  products: [],
  categories: [],
  authToken: null, // Add token storage
};

/* -------------------------
   UTILITY FUNCTIONS
   ------------------------- */
function qs(sel, root = document) {
  return root.querySelector(sel);
}

function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function show(el) {
  if (el) el.style.display = "";
}

function hide(el) {
  if (el) el.style.display = "none";
}

function el(tag, opts = {}) {
  const e = document.createElement(tag);
  if (opts.class) e.className = opts.class;
  if (opts.text) e.textContent = opts.text;
  if (opts.html) e.innerHTML = opts.html;
  if (opts.attrs) {
    for (const k in opts.attrs) {
      e.setAttribute(k, opts.attrs[k]);
    }
  }
  return e;
}

function formatMoney(cents) {
  return (cents / 100).toFixed(2);
}

/* -------------------------
   API FUNCTIONS
   ------------------------- */
async function apiFetch(path, init = {}) {
  const url = path.startsWith("http") ? path : CONFIG.apiBase + path;
  const options = Object.assign({}, CONFIG.fetchDefaults, init);

  // Add token to headers if available
  if (STATE.authToken) {
    options.headers = Object.assign({}, options.headers, {
      Authorization: `Bearer ${STATE.authToken}`,
    });
  }

  try {
    const res = await fetch(url, options);
    const text = await res.text();
    const contentType = res.headers.get("content-type") || "";
    const data =
      contentType.includes("application/json") && text
        ? JSON.parse(text)
        : text;

    if (!res.ok) {
      throw { status: res.status, body: data || text || res.statusText };
    }

    return data;
  } catch (err) {
    throw err;
  }
}

/* -------------------------
   DATA FETCHING FOR DROPDOWNS
   ------------------------- */
async function fetchCustomers() {
  try {
    const customers = await apiFetch("/customers", { method: "GET" });
    STATE.customers = Array.isArray(customers) ? customers : [];
    return STATE.customers;
  } catch (err) {
    console.error("Failed to fetch customers:", err);
    STATE.customers = [];
    return [];
  }
}

async function fetchProducts() {
  try {
    const products = await apiFetch("/products", { method: "GET" });
    STATE.products = Array.isArray(products) ? products : [];
    return STATE.products;
  } catch (err) {
    console.error("Failed to fetch products:", err);
    STATE.products = [];
    return [];
  }
}

async function fetchCategories() {
  try {
    const categories = await apiFetch("/categories", { method: "GET" });
    STATE.categories = Array.isArray(categories) ? categories : [];
    return STATE.categories;
  } catch (err) {
    console.error("Failed to fetch categories:", err);
    STATE.categories = [];
    return [];
  }
}

/* -------------------------
   AUTHENTICATION
   ------------------------- */
async function login(username, password) {
  return apiFetch("/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

async function fetchMe() {
  return apiFetch("/me", { method: "GET" });
}

/* -------------------------
   UI: MODALS AND MESSAGES
   ------------------------- */
function showModal(title, contentNode, { wide = false } = {}) {
  const root = qs("#modal-root");
  root.innerHTML = "";
  root.setAttribute("aria-hidden", "false");

  const backdrop = el("div", { class: "modal-backdrop" });
  const modal = el("div", { class: "modal" });

  if (wide) modal.style.maxWidth = "1000px";

  const header = el("div", { class: "modal-header" });
  header.appendChild(el("div", { text: title }));

  const closeBtn = el("button", { class: "btn secondary", text: "Close" });
  closeBtn.onclick = () => {
    root.innerHTML = "";
    root.setAttribute("aria-hidden", "true");
  };

  header.appendChild(closeBtn);
  modal.appendChild(header);
  modal.appendChild(contentNode);
  backdrop.appendChild(modal);
  root.appendChild(backdrop);
}

function showError(targetEl, message) {
  if (!targetEl) return;
  targetEl.textContent =
    typeof message === "string"
      ? message
      : message?.body?.message || JSON.stringify(message);
  targetEl.style.display = "block";
}

function hideError(targetEl) {
  if (!targetEl) return;
  targetEl.textContent = "";
  targetEl.style.display = "none";
}

/* -------------------------
   SESSION MANAGEMENT
   ------------------------- */
function setSessionUser(user) {
  STATE.currentUser = user;
  if (user) {
    qs("#user-info").textContent = user.username;
    qs("#session-role").textContent = `role: ${user.role}`;
    localStorage.setItem("frontend-current-user", JSON.stringify(user));
  } else {
    qs("#user-info").textContent = "—";
    qs("#session-role").textContent = "role: —";
    localStorage.removeItem("frontend-current-user");
  }
}

/* -------------------------
   LOGIN HANDLERS
   ------------------------- */
async function handleLoginClick() {
  const userEl = qs("#login-username");
  const pwEl = qs("#login-password");
  const errEl = qs("#login-error");

  hideError(errEl);

  const username = userEl.value.trim();
  const password = pwEl.value;

  if (!username || !password) {
    showError(errEl, "Username and password required");
    return;
  }

  try {
    const data = await login(username, password);
    const user = data?.user || data;

    // Store token if provided
    if (data.token) {
      STATE.authToken = data.token;
      localStorage.setItem("auth-token", data.token);
    }

    setSessionUser(user);
    showAppView();
    await loadDashboard();

    // Pre-load dropdown data
    await Promise.all([fetchCustomers(), fetchProducts(), fetchCategories()]);
  } catch (err) {
    showError(
      errEl,
      err.body?.message ||
        (err.status ? `Error ${err.status}` : "Network error")
    );
  }
}

async function handleLogout() {
  try {
    await apiFetch("/logout", { method: "POST" });
  } catch (e) {
    // ignore logout errors
  }

  setSessionUser(null);
  STATE.customers = [];
  STATE.products = [];
  STATE.categories = [];
  STATE.authToken = null;
  localStorage.removeItem("auth-token");
  showLoginView();
}

/* -------------------------
   NAVIGATION
   ------------------------- */
function activateNav(view) {
  STATE.currentView = view;

  qsa(".nav-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view)
  );

  qs("#current-view-title").textContent =
    view.charAt(0).toUpperCase() + view.slice(1);

  const container = qs("#resource-container");
  const dashboard = qs("#view-dashboard");

  if (view === "dashboard") {
    hide(container);
    show(dashboard);
  } else {
    show(container);
    hide(dashboard);
    renderResourceView(view);
  }
}

/* -------------------------
   PERMISSION HELPERS
   ------------------------- */
function hasRead() {
  return STATE.currentUser && ["r", "w", "a"].includes(STATE.currentUser.role);
}

function hasWrite() {
  return STATE.currentUser && ["w", "a"].includes(STATE.currentUser.role);
}

function isAdmin() {
  return STATE.currentUser && STATE.currentUser.role === "a";
}

/* -------------------------
   RESOURCE VIEW RENDERING
   ------------------------- */
function createToolbarFor(resource) {
  const toolbar = el("div", { class: "row" });
  const left = el("div", { class: "col" });
  const right = el("div", {
    class: "col",
    attrs: { style: "text-align:right" },
  });

  const btnAdd = el("button", {
    class: "btn",
    text: `Add ${resource.slice(0, -1)}`,
  });
  btnAdd.onclick = () => openCreateModal(resource);

  const btnRefresh = el("button", {
    class: "btn secondary",
    text: "Refresh",
  });
  btnRefresh.onclick = () => fetchAndRenderResource(resource);

  right.appendChild(btnAdd);
  right.appendChild(btnRefresh);
  toolbar.appendChild(left);
  toolbar.appendChild(right);

  // Role-based visibility
  if (!hasWrite()) btnAdd.style.display = "none";

  return toolbar;
}

async function renderResourceView(resource) {
  const container = qs("#resource-container");
  container.innerHTML = "";

  const title = el("h3", {
    text: resource.charAt(0).toUpperCase() + resource.slice(1),
  });
  container.appendChild(title);
  container.appendChild(createToolbarFor(resource));

  const holder = el("div", { class: "card data-table" });
  holder.appendChild(
    el("div", {
      class: "muted loading",
      text: "Loading...",
    })
  );

  container.appendChild(holder);
  await fetchAndRenderResource(resource, holder);
}

/* -------------------------
   RESOURCE DATA FETCHING AND TABLE BUILDING
   ------------------------- */
async function fetchAndRenderResource(resource, holderEl = null) {
  holderEl = holderEl || qs("#resource-container .card");
  holderEl.innerHTML = "";

  if (!hasRead()) {
    holderEl.appendChild(
      el("div", {
        class: "error",
        text: "You do not have read access.",
      })
    );
    return;
  }

  const endpoint = CONFIG.resources[resource];
  if (!endpoint) {
    holderEl.appendChild(
      el("div", {
        class: "error",
        text: "No endpoint configured for " + resource,
      })
    );
    return;
  }

  try {
    const data = await apiFetch(endpoint, { method: "GET" });
    STATE.lastFetched[resource] = data;

    // Build table
    const table = el("table");
    const thead = el("thead");
    const headerRow = el("tr");

    const sample = Array.isArray(data) ? data[0] || {} : {};
    const keys = Object.keys(sample);
    const cols = ["id", ...keys.filter((k) => k !== "id")];

    cols.forEach((k) => headerRow.appendChild(el("th", { text: k })));
    headerRow.appendChild(el("th", { text: "Actions" }));

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    (Array.isArray(data) ? data : []).forEach((item) => {
      const tr = el("tr");

      cols.forEach((c) => {
        const value =
          item[c] === null || item[c] === undefined ? "" : String(item[c]);
        tr.appendChild(el("td", { text: value }));
      });

      const actionsTd = el("td");
      const btnView = el("button", { class: "btn secondary", text: "View" });
      btnView.onclick = () => openViewModal(resource, item);
      actionsTd.appendChild(btnView);

      if (hasWrite()) {
        const btnEdit = el("button", { class: "btn", text: "Edit" });
        btnEdit.onclick = () => openEditModal(resource, item);
        actionsTd.appendChild(btnEdit);

        const btnDel = el("button", { class: "btn danger", text: "Delete" });
        btnDel.onclick = () => handleDelete(resource, item);
        actionsTd.appendChild(btnDel);
      }

      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    holderEl.appendChild(table);

    if ((Array.isArray(data) ? data.length : 0) === 0) {
      const emptyState = el("div", { class: "empty-state" });
      emptyState.innerHTML =
        '<h4>No records found</h4><p class="muted">Click "Add" to create the first record.</p>';
      holderEl.appendChild(emptyState);
    }
  } catch (err) {
    holderEl.appendChild(
      el("div", {
        class: "error",
        text: err.body?.message || "Error " + (err.status || ""),
      })
    );
  }
}

/* -------------------------
   FORM BUILDING WITH DROPDOWN SUPPORT
   ------------------------- */
async function buildFormFor(resource, item = {}, readonly = false) {
  // Special handling for sales
  if (resource === "sales") {
    return await buildSalesForm(item, readonly);
  }

  // Ensure we have the dropdown data
  await Promise.all([fetchCustomers(), fetchProducts(), fetchCategories()]);

  const schema = {
    users: [
      { k: "username", label: "Username" },
      { k: "password", label: "Password", type: "password" },
      {
        k: "role",
        label: "Role",
        type: "select",
        options: ["r", "w", "a", "d"],
      },
    ],
    products: [
      { k: "sku", label: "SKU" },
      { k: "active", label: "Active", type: "checkbox" },
      { k: "name", label: "Name" },
      { k: "price_cents", label: "Price (cents)" },
      { k: "quantity", label: "Quantity" },
      { k: "description", label: "Description", type: "textarea" },
      {
        k: "category_id",
        label: "Category",
        type: "dropdown",
        dataSource: "categories",
      },
    ],
    categories: [
      { k: "name", label: "Name" },
      { k: "description", label: "Description", type: "textarea" },
    ],
    customers: [
      { k: "name", label: "Name" },
      { k: "email", label: "Email" },
      { k: "phone", label: "Phone" },
      { k: "address", label: "Address" },
      { k: "city", label: "City" },
      { k: "state", label: "State" },
      { k: "post_code", label: "Post Code" },
      { k: "country", label: "Country" },
    ],
    sales: [
      { k: "time", label: "Time" },
      { k: "total_cents", label: "Total (cents)" },
      {
        k: "customer_id",
        label: "Customer",
        type: "dropdown",
        dataSource: "customers",
      },
      { k: "user_id", label: "User ID" },
    ],
    logs: [
      { k: "type", label: "Type" },
      {
        k: "product_id",
        label: "Product",
        type: "dropdown",
        dataSource: "products",
      },
      { k: "delta", label: "Delta" },
      { k: "note", label: "Note" },
    ],
  };

  const fields =
    schema[resource] ||
    Object.keys(item)
      .filter((k) => k !== "details")
      .map((k) => ({ k, label: k }));
  const form = el("form", { class: "form-grid" });

  fields.forEach((f) => {
    const wrapper = el("label");
    const id = `f-${resource}-${f.k}`;

    wrapper.appendChild(
      el("div", {
        text: f.label || f.k,
        attrs: { style: "font-size:13px;margin-bottom:6px;font-weight:500;" },
      })
    );

    let input;

    if (f.type === "textarea") {
      input = el("textarea", { attrs: { id, rows: 4 } });
      input.value = item[f.k] || "";
    } else if (f.type === "select") {
      input = el("select", { attrs: { id } });
      (f.options || []).forEach((opt) => {
        input.appendChild(el("option", { text: opt, attrs: { value: opt } }));
      });
      input.value = item[f.k] || "";
    } else if (f.type === "dropdown") {
      input = el("select", { attrs: { id } });

      // Add empty option
      input.appendChild(
        el("option", { text: "-- Select --", attrs: { value: "" } })
      );

      // Populate from data source
      const dataSource = STATE[f.dataSource] || [];
      dataSource.forEach((dataItem) => {
        let displayText = "";
        let value = dataItem.id;

        if (f.dataSource === "customers") {
          displayText = `${dataItem.name} (ID: ${dataItem.id})`;
        } else if (f.dataSource === "products") {
          displayText = `${dataItem.name} - ${dataItem.sku} (ID: ${dataItem.id})`;
        } else if (f.dataSource === "categories") {
          displayText = `${dataItem.name} (ID: ${dataItem.id})`;
        } else {
          displayText =
            dataItem.name || dataItem.username || `ID: ${dataItem.id}`;
        }

        input.appendChild(
          el("option", {
            text: displayText,
            attrs: { value: value },
          })
        );
      });

      input.value = item[f.k] || "";
    } else if (f.type === "checkbox") {
      input = el("input", { attrs: { type: "checkbox", id } });
      input.checked = !!item[f.k];
    } else {
      input = el("input", { attrs: { type: f.type || "text", id } });
      input.value = item[f.k] || "";
    }

    if (readonly) {
      input.setAttribute("disabled", "disabled");
    }

    wrapper.appendChild(input);
    form.appendChild(wrapper);
  });

  return form;
}

async function buildSalesForm(item = {}, readonly = false) {
  // Ensure we have customer and product data
  await Promise.all([fetchCustomers(), fetchProducts()]);

  const form = el("form");
  form.style.display = "grid";
  form.style.gap = "15px";

  // Customer dropdown
  const customerWrapper = el("label");
  customerWrapper.appendChild(
    el("div", {
      text: "Customer",
      attrs: { style: "font-size:13px;margin-bottom:6px;font-weight:500;" },
    })
  );

  const customerSelect = el("select", { attrs: { id: "f-sales-customer_id" } });
  customerSelect.appendChild(
    el("option", { text: "-- Select Customer --", attrs: { value: "" } })
  );

  STATE.customers.forEach((customer) => {
    customerSelect.appendChild(
      el("option", {
        text: `${customer.name} (ID: ${customer.id})`,
        attrs: { value: customer.id },
      })
    );
  });

  customerSelect.value = item.customer_id || "";
  if (readonly) customerSelect.setAttribute("disabled", "disabled");

  customerWrapper.appendChild(customerSelect);
  form.appendChild(customerWrapper);

  // Sale details section
  const detailsWrapper = el("div");
  detailsWrapper.appendChild(
    el("div", {
      text: "Sale Items",
      attrs: { style: "font-weight:bold;margin-bottom:10px;" },
    })
  );

  const detailsContainer = el("div", { attrs: { id: "sales-details" } });
  form.appendChild(detailsWrapper);
  form.appendChild(detailsContainer);

  // Add item button
  if (!readonly) {
    const addBtn = el("button", {
      text: "+ Add Item",
      class: "btn",
      attrs: { type: "button" },
    });
    addBtn.onclick = () => addSaleDetail(detailsContainer);
    form.appendChild(addBtn);

    // Add initial item
    addSaleDetail(detailsContainer);
  }

  return form;
}

function addSaleDetail(container) {
  const detail = el("div", { class: "sales-detail-item" });

  const removeBtn = el("button", {
    text: "Remove",
    class: "btn danger sales-detail-remove",
    attrs: { type: "button" },
  });
  removeBtn.onclick = () => container.removeChild(detail);

  // Product dropdown
  const productWrapper = el("label");
  productWrapper.appendChild(
    el("div", {
      text: "Product",
      attrs: { style: "font-size:13px;margin-bottom:6px;font-weight:500;" },
    })
  );

  const productSelect = el("select", { class: "product-select" });
  productSelect.appendChild(
    el("option", { text: "-- Select Product --", attrs: { value: "" } })
  );

  STATE.products.forEach((product) => {
    const option = el("option", {
      text: `${product.name} - ${product.sku} ($${formatMoney(
        product.price_cents
      )})`,
      attrs: {
        value: product.id,
        "data-price": product.price_cents,
      },
    });
    productSelect.appendChild(option);
  });

  productWrapper.appendChild(productSelect);

  const quantityWrapper = el("label");
  quantityWrapper.appendChild(
    el("div", {
      text: "Quantity",
      attrs: { style: "font-size:13px;margin-bottom:6px;font-weight:500;" },
    })
  );
  const quantityInput = el("input", {
    class: "quantity-input",
    attrs: { type: "number", placeholder: "Quantity", min: "1", value: "1" },
  });
  quantityWrapper.appendChild(quantityInput);

  const subtotalWrapper = el("label");
  subtotalWrapper.appendChild(
    el("div", {
      text: "Subtotal (cents)",
      attrs: { style: "font-size:13px;margin-bottom:6px;font-weight:500;" },
    })
  );
  const subtotalInput = el("input", {
    class: "subtotal-input",
    attrs: {
      type: "number",
      placeholder: "Auto-calculated",
      readonly: true,
      min: "0",
    },
  });
  subtotalWrapper.appendChild(subtotalInput);

  const noteWrapper = el("label");
  noteWrapper.appendChild(
    el("div", {
      text: "Note (optional)",
      attrs: { style: "font-size:13px;margin-bottom:6px;font-weight:500;" },
    })
  );
  const noteInput = el("input", { attrs: { placeholder: "Optional note" } });
  noteWrapper.appendChild(noteInput);

  // Function to calculate subtotal
  function calculateSubtotal() {
    const selectedOption = productSelect.options[productSelect.selectedIndex];
    const pricePerUnit = selectedOption
      ? parseInt(selectedOption.getAttribute("data-price")) || 0
      : 0;
    const quantity = parseInt(quantityInput.value) || 0;
    const subtotal = pricePerUnit * quantity;

    subtotalInput.value = subtotal;
    subtotalInput.style.backgroundColor = subtotal > 0 ? "#f0f9ff" : "#fff";
  }

  // Add event listeners for automatic calculation
  productSelect.addEventListener("change", calculateSubtotal);
  quantityInput.addEventListener("input", calculateSubtotal);

  detail.appendChild(removeBtn);
  detail.appendChild(productWrapper);
  detail.appendChild(quantityWrapper);
  detail.appendChild(subtotalWrapper);
  detail.appendChild(noteWrapper);

  container.appendChild(detail);

  // Initial calculation
  calculateSubtotal();
}

/* -------------------------
   MODAL OPERATIONS
   ------------------------- */
function openViewModal(resource, item) {
  const content = el("div");
  content.style.fontFamily = "monospace";
  content.style.lineHeight = "1.6";
  content.style.fontSize = "14px";

  const fieldMappings = {
    products: [
      { key: "id", label: "ID" },
      { key: "sku", label: "SKU" },
      { key: "name", label: "Name" },
      { key: "active", label: "Active", format: (val) => (val ? "Yes" : "No") },
      { key: "price_cents", label: "Price (cents)" },
      { key: "quantity", label: "Quantity" },
      { key: "description", label: "Description" },
      { key: "category_id", label: "Category ID" },
    ],
    categories: [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
      { key: "description", label: "Description" },
    ],
    customers: [
      { key: "id", label: "ID" },
      { key: "name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "address", label: "Address" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "post_code", label: "Post Code" },
      { key: "country", label: "Country" },
    ],
    sales: [
      { key: "id", label: "ID" },
      {
        key: "time",
        label: "Time",
        format: (val) => new Date(val * 1000).toLocaleString(),
      },
      { key: "total_cents", label: "Total (cents)" },
      { key: "customer_name", label: "Customer" },
      { key: "user_id", label: "User ID" },
    ],
    users: [
      { key: "id", label: "ID" },
      { key: "username", label: "Username" },
      { key: "role", label: "Role" },
    ],
    logs: [
      { key: "id", label: "ID" },
      {
        key: "time",
        label: "Time",
        format: (val) => new Date(val * 1000).toLocaleString(),
      },
      { key: "type", label: "Type" },
      { key: "product_id", label: "Product ID" },
      { key: "delta", label: "Delta" },
      { key: "note", label: "Note" },
    ],
  };

  const fields =
    fieldMappings[resource] ||
    Object.keys(item)
      .filter((k) => k !== "details")
      .map((k) => ({ key: k, label: k }));

  fields.forEach((field) => {
    if (
      item.hasOwnProperty(field.key) &&
      item[field.key] !== null &&
      item[field.key] !== undefined &&
      item[field.key] !== ""
    ) {
      const line = el("div");
      line.style.marginBottom = "8px";

      const value = field.format
        ? field.format(item[field.key])
        : item[field.key];
      line.textContent = `${field.label}: ${value}`;

      content.appendChild(line);
    }
  });

  showModal(`${resource.slice(0, -1)} details`, content);
}

async function openCreateModal(resource) {
  const form = await buildFormFor(resource, {});
  const submit = el("button", { class: "btn", text: "Create" });
  const error = el("div", {
    class: "error",
    attrs: { style: "display:none;" },
  });

  submit.onclick = async (ev) => {
    ev.preventDefault();
    hideError(error);

    const body = collectFormValues(resource, form);

    // Basic validation
    if (resource === "users" && !body.username) {
      showError(error, "Username required");
      return;
    }

    try {
      await apiFetch(CONFIG.resources[resource], {
        method: "POST",
        body: JSON.stringify(body),
      });
      closeModal();
      await fetchAndRenderResource(resource);
    } catch (err) {
      showError(error, err.body?.message || "Create failed");
    }
  };

  const content = el("div");
  content.appendChild(form);
  content.appendChild(error);

  const actions = el("div", { class: "form-actions" });
  actions.appendChild(submit);
  content.appendChild(actions);

  showModal(`Create ${resource.slice(0, -1)}`, content, { wide: true });
}

async function openEditModal(resource, item) {
  const form = await buildFormFor(resource, item);
  const error = el("div", {
    class: "error",
    attrs: { style: "display:none;" },
  });
  const submit = el("button", { class: "btn", text: "Save Changes" });

  submit.onclick = async (ev) => {
    ev.preventDefault();
    hideError(error);

    const body = collectFormValues(resource, form);
    delete body.id; // Remove ID from update payload

    try {
      await apiFetch(`${CONFIG.resources[resource]}/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      closeModal();
      await fetchAndRenderResource(resource);
    } catch (err) {
      showError(error, err.body?.message || "Update failed");
    }
  };

  const content = el("div");
  content.appendChild(form);
  content.appendChild(error);

  const actions = el("div", { class: "form-actions" });
  actions.appendChild(submit);
  content.appendChild(actions);

  showModal(`Edit ${resource.slice(0, -1)}`, content, { wide: true });
}

function collectFormValues(resource, formEl) {
  if (resource === "sales") {
    const data = {};

    // Get customer ID
    const customerSelect = formEl.querySelector("#f-sales-customer_id");
    if (customerSelect && customerSelect.value) {
      data.customer_id = Number(customerSelect.value);
    }

    // Get sale details
    const detailsContainer = formEl.querySelector("#sales-details");
    const detailDivs = detailsContainer
      ? Array.from(detailsContainer.children)
      : [];
    const details = [];

    detailDivs.forEach((div) => {
      const productSelect = div.querySelector(".product-select");
      const quantityInput = div.querySelector(".quantity-input");
      const subtotalInput = div.querySelector(".subtotal-input");
      const noteInput = div.querySelector('input[placeholder="Optional note"]');

      console.log("Processing detail div:", {
        productSelect: productSelect?.value,
        quantity: quantityInput?.value,
        subtotal: subtotalInput?.value,
      }); // Debug

      if (productSelect && quantityInput && subtotalInput) {
        const detail = {};
        if (productSelect.value)
          detail.product_id = Number(productSelect.value);
        if (quantityInput.value) detail.quantity = Number(quantityInput.value);
        if (subtotalInput.value) {
          // Convert dollars to cents (multiply by 100)
          detail.subtotal_cents = Math.round(Number(subtotalInput.value) * 100);
        }
        if (noteInput && noteInput.value) detail.note = noteInput.value;

        console.log("Processed detail:", detail); // Debug

        if (detail.product_id && detail.quantity && detail.subtotal_cents) {
          details.push(detail);
        }
      }
    });

    data.details = details;
    console.log("Sales data being sent:", data); // Debug log
    return data;
  }

  // Default handling for other resources
  const data = {};
  const inputs = Array.from(formEl.querySelectorAll("input, textarea, select"));

  inputs.forEach((i) => {
    const id = i.id || "";
    const parts = id.split("-");
    const key = parts.slice(2).join("-");

    if (!key) return;

    if (i.type === "checkbox") {
      data[key] = i.checked;
    } else if (i.type === "number" || i.tagName === "SELECT") {
      data[key] =
        i.value === "" ? null : i.type === "number" ? Number(i.value) : i.value;
    } else {
      data[key] = i.value;
    }
  });

  return data;
}

function closeModal() {
  const root = qs("#modal-root");
  root.innerHTML = "";
  root.setAttribute("aria-hidden", "true");
}

/* -------------------------
   DELETE HANDLING
   ------------------------- */
async function handleDelete(resource, item) {
  const content = el("div");
  const txt = el("div", {
    html: `<div class="muted">Confirm deletion of <strong>${resource.slice(
      0,
      -1
    )} #${item.id}</strong></div>`,
  });
  content.appendChild(txt);

  const err = el("div", { class: "error", attrs: { style: "display:none" } });
  const confirm = el("button", { class: "btn danger", text: "Delete" });

  confirm.onclick = async () => {
    hideError(err);
    try {
      await apiFetch(`${CONFIG.resources[resource]}/${item.id}`, {
        method: "DELETE",
      });
      closeModal();
      await fetchAndRenderResource(resource);
    } catch (e) {
      showError(err, e.body?.message || "Delete failed");
    }
  };

  content.appendChild(err);

  const actions = el("div", { class: "form-actions" });
  actions.appendChild(confirm);
  content.appendChild(actions);

  showModal("Confirm delete", content);
}

/* -------------------------
   DASHBOARD
   ------------------------- */
async function loadDashboard() {
  const s1 = qs("#overview-stats");
  s1.innerHTML = '<div class="muted loading">Loading overview...</div>';

  try {
    const [products, users, categories] = await Promise.all([
      apiFetch(CONFIG.resources.products, { method: "GET" }),
      apiFetch(CONFIG.resources.users, { method: "GET" }),
      apiFetch(CONFIG.resources.categories, { method: "GET" }),
    ]);

    s1.innerHTML = `
      <div><strong>Products:</strong> ${
        Array.isArray(products) ? products.length : 0
      }</div>
      <div><strong>Users:</strong> ${
        Array.isArray(users) ? users.length : 0
      }</div>
      <div><strong>Categories:</strong> ${
        Array.isArray(categories) ? categories.length : 0
      }</div>
    `;

    const recentEl = qs("#overview-recent");
    try {
      const sales = await apiFetch(CONFIG.resources.sales, { method: "GET" });
      const recentSales = Array.isArray(sales) ? sales.slice(0, 5) : [];

      recentEl.innerHTML = `
        <div class="muted">Recent sales (${recentSales.length})</div>
        <ul>
          ${recentSales
            .map(
              (s) =>
                `<li>#${s.id} ${
                  s.total_cents ? "$" + formatMoney(s.total_cents) : ""
                }</li>`
            )
            .join("")}
        </ul>
      `;
    } catch (e) {
      recentEl.innerHTML =
        '<div class="muted">Failed to load recent sales</div>';
    }
  } catch (e) {
    s1.innerHTML = '<div class="error">Unable to load overview</div>';
  }
}

/* -------------------------
   VIEW MANAGEMENT
   ------------------------- */
function showLoginView() {
  hide(qs("#view-app"));
  show(qs("#view-login"));
  hide(qs("#view-dashboard"));
  qs("#view-login").setAttribute("aria-hidden", "false");
}

function showAppView() {
  hide(qs("#view-login"));
  show(qs("#view-app"));
  qs("#view-app").setAttribute("aria-hidden", "false");
  activateNav(STATE.currentView || "dashboard");
}

/* -------------------------
   APPLICATION INITIALIZATION
   ------------------------- */
async function initApp() {
  // Wire UI event handlers
  qs("#btn-login").onclick = handleLoginClick;
  qs("#btn-sample").onclick = () => {
    qs("#login-username").value = "admin";
    qs("#login-password").value = "admin";
  };
  qs("#btn-logout").onclick = handleLogout;

  qsa(".nav-btn").forEach(
    (b) => (b.onclick = () => activateNav(b.dataset.view))
  );

  qs("#quick-refresh").onclick = () => {
    if (STATE.currentView !== "dashboard") {
      fetchAndRenderResource(STATE.currentView);
    } else {
      loadDashboard();
    }
  };

  qs("#quick-add").onclick = () => {
    if (STATE.currentView !== "dashboard") {
      openCreateModal(STATE.currentView);
    }
  };

  // Attempt to rehydrate current user and token
  const localUser = localStorage.getItem("frontend-current-user");
  const savedToken = localStorage.getItem("auth-token");

  if (savedToken) {
    STATE.authToken = savedToken;
  }

  if (localUser) {
    try {
      const u = JSON.parse(localUser);
      setSessionUser(u);
    } catch (e) {
      localStorage.removeItem("frontend-current-user");
    }
  }

  try {
    const me = await fetchMe();
    setSessionUser(me);
    showAppView();
    await loadDashboard();

    // Pre-load dropdown data
    await Promise.all([fetchCustomers(), fetchProducts(), fetchCategories()]);
  } catch (e) {
    // Not logged in or token expired
    STATE.authToken = null;
    localStorage.removeItem("auth-token");
    showLoginView();
  }
}

/* -------------------------
   APPLICATION START
   ------------------------- */
// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
