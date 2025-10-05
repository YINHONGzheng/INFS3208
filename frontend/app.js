// --- Config ---
// const API_BASE = "http://localhost:3000/api";
const API_BASE = "/api";

// --- Helpers ---
function getSessionId() {
  let sid = localStorage.getItem("uqms_session");
  if (!sid) {
    sid = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    localStorage.setItem("uqms_session", sid);
  }
  return sid;
}
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }
function toast(msg, type = "info") {
  const el = $("#status");
  el.textContent = msg;
  el.className = `status ${type}`;
  setTimeout(() => { el.textContent = ""; el.className = "status"; }, 2000);
}

// --- State ---
let products = [];
let filtered = [];
let pendingAdd = null;

// --- DOM refs ---
const grid = $("#productGrid");
const searchInput = $("#searchInput");
const btnSearch = $("#btnSearch");
const cartDrawer = $("#cartDrawer");
const btnCart = $("#btnCart");
const btnCloseCart = $("#btnCloseCart");
const cartList = $("#cartList");
const cartTotal = $("#cartTotal");
const cartCount = $("#cartCount");
const btnCheckout = $("#btnCheckout");
const checkoutDialog = $("#checkoutDialog");
const btnPlaceOrder = $("#btnPlaceOrder");

const btnCancelCheckout = checkoutDialog.querySelector('button[value="cancel"]');
btnCancelCheckout?.addEventListener('click', (e) => {
  e.preventDefault();
  checkoutDialog.close();
});

const btnCloseCheckout = document.getElementById('btnCloseCheckout');
btnCloseCheckout?.addEventListener('click', () => checkoutDialog.close());

// --- Render products ---
function renderProducts(list) {
  grid.innerHTML = "";
  if (!list.length) {
    grid.innerHTML = `<p class="muted">No products found.</p>`;
    return;
  }
  list.forEach(p => {
    const card = document.createElement("div");
    card.className = "card";
    const imgSrc = p.image_url;
    card.innerHTML = `
      <div class="card-img">
        <img src="${imgSrc}" alt="${p.name}">
      </div>
      <div class="card-body">
        <div class="title">${p.name}</div>
        <div class="category">${p.category || ""}</div>
        <div class="price">$${Number(p.price).toFixed(2)}</div>
      </div>
      <div class="card-actions">
        <button class="btn-add" data-id="${p.id}">+ Add</button>
      </div>
    `;
    grid.appendChild(card);
  });

  // bind add buttons
  $all(".btn-add").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = Number(e.currentTarget.dataset.id);
      await addToCart(id, 1);
    });
  });
}

// --- Fetch products ---
async function loadProducts() {
  const res = await fetch(`${API_BASE}/catalog`);
  products = await res.json();
  filtered = products.slice();
  renderProducts(filtered);
}

// --- Search ---
function doSearch() {
  const q = (searchInput.value || "").trim().toLowerCase();
  if (!q) {
    filtered = products.slice();
  } else {
    filtered = products.filter(p =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q)
    );
  }
  renderProducts(filtered);
}

// --- Cart ---
async function addToCart(productId, qty = 1) {
  if (!getToken()) {
    pendingAdd = { productId, qty };
    toast("Please log in to add items.", "info");
    switchTab("login");          
    authDialog.showModal();     
    return;
  }

  const res = await fetch(`${API_BASE}/cart/add`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": getSessionId()
    },
    body: JSON.stringify({ productId, qty })
  });
  const data = await res.json();
  if (data.success) {
    toast("Added to cart", "ok");
    await refreshCartCount();

    if (!cartDrawer.classList.contains("hidden")) {
      const cart = await fetchCart();
      renderCart(cart);
    }
  } else {
    toast(data.error || "Failed to add", "error");
  }
}

async function fetchCart() {
  const res = await fetch(`${API_BASE}/cart`, {
    headers: { "X-Session-Id": getSessionId() }
  });
  return res.json();
}

async function openCart() {
  const cart = await fetchCart();
  renderCart(cart);
  cartDrawer.classList.remove("hidden");
}

function renderCart(cart) {
  cartList.innerHTML = "";
  (cart.items || []).forEach(item => {
    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `
      <div class="row-title">${item.name}</div>
      <div class="row-qty">x${item.qty}</div>
      <div class="row-price">$${Number(item.subtotal).toFixed(2)}</div>
      <button class="row-remove" data-id="${item.id}">🗑</button>
    `;
    cartList.appendChild(row);
  });
  cartTotal.textContent = Number(cart.total || 0).toFixed(2);

  // remove binding
  $all(".row-remove").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const cartItemId = Number(e.currentTarget.dataset.id);
      await fetch(`${API_BASE}/cart/remove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": getSessionId()
        },
        body: JSON.stringify({ cartItemId })
      });
      openCart();
      refreshCartCount();
    });
  });
}

async function refreshCartCount() {
  const cart = await fetchCart();
  const count = (cart.items || []).reduce((s, it) => s + Number(it.qty), 0);
  cartCount.textContent = count;
}

// --- Checkout ---
async function doCheckout() {
  // Collect simple information
  const name = $("#chkName")?.value || "";
  const email = $("#chkEmail")?.value || "";
  const phone = $("#chkPhone")?.value || "";

  const res = await fetch(`${API_BASE}/order/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Id": getSessionId()
    },
    body: JSON.stringify({ /* userId optional: null */ })
  });
  const data = await res.json();
  if (data.success) {
    $("#checkoutMsg").textContent =
      `Order #${data.orderId} placed. Pickup code: ${data.pickupCode}`;
    await refreshCartCount();
    // Close the drawer and keep the dialog prompt
    cartDrawer.classList.add("hidden");
    ["chkName","chkEmail","chkPhone"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
  } else {
    $("#checkoutMsg").textContent = data.error || "Checkout failed.";
  }
}

// --- Events ---
btnSearch.addEventListener("click", doSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

btnCart.addEventListener("click", openCart);
btnCloseCart.addEventListener("click", () => cartDrawer.classList.add("hidden"));

btnCheckout.addEventListener("click", async () => {
  const name = getName?.() || "";
  const nameInput = document.getElementById("chkName");
  if (nameInput && !nameInput.value) nameInput.value = name;

  const cart = await fetchCart();
  const msg = document.getElementById("checkoutMsg");
  const placeBtn = document.getElementById("btnPlaceOrder");
  if (!cart.items || cart.items.length === 0) {
    msg.textContent = "Cart is empty";
    placeBtn.disabled = true;
  } else {
    msg.textContent = "";
    placeBtn.disabled = false;
  }
  checkoutDialog.showModal();
});

btnPlaceOrder.addEventListener("click", (e) => {
  e.preventDefault();
  doCheckout();
});

// Category chips
$all(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const cat = chip.dataset.cat;
    if (cat === "All") {
      filtered = products.slice();
    } else {
      filtered = products.filter(p => (p.category || "") === cat);
    }
    renderProducts(filtered);
  });
});

// ===== Auth (Login/Register) =====
const authDialog = document.getElementById("authDialog");
const tabLogin = document.getElementById("tabLogin");
const tabRegister = document.getElementById("tabRegister");
const panelLogin = document.getElementById("panelLogin");
const panelRegister = document.getElementById("panelRegister");
const btnDoLogin = document.getElementById("btnDoLogin");
const btnDoRegister = document.getElementById("btnDoRegister");
const loginMsg = document.getElementById("loginMsg");
const regMsg = document.getElementById("regMsg");

const btnLogin = document.getElementById("btnLogin");
const btnRegister = document.getElementById("btnRegister");

function getToken() { return localStorage.getItem("uqms_token"); }
function setToken(t) { localStorage.setItem("uqms_token", t); }
function clearToken() { localStorage.removeItem("uqms_token"); }

function getName() { return localStorage.getItem("uqms_name"); }
function setName(n) { localStorage.setItem("uqms_name", n); }
function clearName() { localStorage.removeItem("uqms_name"); }

function setAuthUI() {
  localStorage.getItem("uqms_token");
  const token = getToken();
  if (token) {
    const name = getName();
    btnLogin.textContent = "Logout";
    btnRegister.textContent = name ? `Welcome, ${name.split(' ')[0]}` : "Welcome";
    btnRegister.disabled = true;
  } else {
    btnLogin.textContent = "Login";
    btnRegister.textContent = "Register";
    btnRegister.disabled = false;
  }
}

function switchTab(which) {
  const isLogin = which === "login";
  tabLogin.classList.toggle("active", isLogin);
  tabRegister.classList.toggle("active", !isLogin);
  panelLogin.classList.toggle("hidden", !isLogin);
  panelRegister.classList.toggle("hidden", isLogin);
  loginMsg.textContent = "";
  regMsg.textContent = "";
}

btnLogin.addEventListener("click", async () => {
  if (getToken && getToken()) {
    try {
      await fetch(`${API_BASE}/cart/clear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": getSessionId()
        }
      });
    } catch (_) { /* Ignore clearing failure and do not block logout */ }

    clearToken && clearToken();
    clearName && clearName();

    localStorage.removeItem("uqms_session");
    getSessionId();

    await refreshCartCount();
    cartDrawer?.classList.add("hidden");
    toast("Logged out. Cart cleared.", "ok");
    setTimeout(() => window.location.reload(), 150);
  } else {
    switchTab && switchTab("login");
    authDialog?.showModal();
  }
});

btnRegister.addEventListener("click", () => {
  switchTab("register");
  authDialog.showModal();
});

tabLogin.addEventListener("click", () => switchTab("login"));
tabRegister.addEventListener("click", () => switchTab("register"));

btnDoLogin.addEventListener("click", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  loginMsg.textContent = "Signing in...";
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success && data.token) {
      setToken(data.token);
      if (data.fullname) setName(data.fullname);
      setAuthUI();
      authDialog.close();
      toast("Logged in", "ok");

      if (pendingAdd) {
        const { productId, qty } = pendingAdd;
        pendingAdd = null;
        addToCart(productId, qty);
      }
    } else {
      loginMsg.textContent = data.error || "Please enter a valid email and password.";
    }
  } catch (err) {
    loginMsg.textContent = err.message;
  }
});

btnDoRegister.addEventListener("click", async (e) => {
  e.preventDefault();
  const fullname = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;
  regMsg.textContent = "Registering...";
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullname, email, password })
    });
    const data = await res.json();
    if (data.success) {
      regMsg.textContent = "Registered. You can login now.";
      switchTab("login");
    } else {
      regMsg.textContent = data.error || "Register failed";
    }
  } catch (err) {
    regMsg.textContent = err.message;
  }
});

const authClose = document.getElementById("authClose");
const btnCancelLogin = document.getElementById("btnCancelLogin");
const btnCancelRegister = document.getElementById("btnCancelRegister");

authClose.addEventListener("click", () => {
  authDialog.close();
});

btnCancelLogin.addEventListener("click", () => authDialog.close());
btnCancelRegister.addEventListener("click", () => authDialog.close());

setAuthUI();

// --- init ---
(async function init() {
  getSessionId();
  await loadProducts();
  await refreshCartCount();
})();

