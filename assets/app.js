/* ============================================================
   LORO — app engine
   Static, wallet only. Reads go to LoroLens through the wallet
   (or the optional public RPC in config). Writes go straight to
   LoroLoan from the user's wallet. No backend, no custody.
   ============================================================ */

import { loadConfig } from "../config/loro.config.js";
import { LORO_LOAN_ABI, LORO_LENS_ABI, ERC20_ABI } from "./loro-abi.js";
import * as core from "./loro-core.js";

const ethers = window.ethers;
const { Status } = core;
const ETH = core.ETH_ADDRESS;
const Filter = { Status: 0, Lender: 1, Borrower: 2, Collateral: 3 };
const REFRESH_MS = 15000;
const MAX_DURATION = 3650 * 86400;
const MAX_WINDOW = 365 * 86400;

const $ = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => Array.prototype.slice.call((c || document).querySelectorAll(s));
const esc = (v) => String(v).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const S = {
  cfg: null,
  ready: false,           // protocol values loaded from chain
  rpc: null,              // optional read provider from config
  eip1193: null,          // connected wallet
  wallet: null,           // ethers BrowserProvider
  signer: null,
  account: null,
  chainId: null,
  stable: null,           // { address, symbol, decimals }
  feeBps: 0n,
  tokens: new Map(),      // lowercased address -> { symbol, decimals }
  offset: 0,              // chain time minus local clock, seconds
  lists: { offers: [], lender: [], borrower: [], auctions: [] },
  byId: new Map(),
  flagsKey: "",
  loading: false,
  announced: []
};

const loanIface = ethers ? new ethers.Interface(LORO_LOAN_ABI) : null;
const erc20Iface = ethers ? new ethers.Interface(ERC20_ABI) : null;

/* ============================================================
   Small helpers
   ============================================================ */
const lower = (a) => (a || "").toLowerCase();
const isMe = (a) => Boolean(S.account) && lower(a) === lower(S.account);
const chainNow = () => BigInt(Math.floor(Date.now() / 1000) + S.offset);
const meta = (addr) => S.tokens.get(lower(addr));

function fmt(value, m, max) {
  if (!m || m.decimals == null) return value.toString() + " base units";
  return core.formatUnits(value, m.decimals, max == null ? 6 : max);
}
function amt(value, m, max) {
  return fmt(value, m, max) + (m && m.decimals != null ? " " + m.symbol : "");
}

function reader() {
  if (S.wallet && S.chainId === S.cfg.chainId) return S.wallet;
  return S.rpc;
}
const loanAt = (runner) => new ethers.Contract(S.cfg.contracts.loroLoan, LORO_LOAN_ABI, runner);
const lensAt = (runner) => new ethers.Contract(S.cfg.contracts.loroLens, LORO_LENS_ABI, runner);
const tokenAt = (addr, runner) => new ethers.Contract(addr, ERC20_ABI, runner);

function explorer(kind, value) {
  return S.cfg.explorerUrl ? S.cfg.explorerUrl.replace(/\/$/, "") + "/" + kind + "/" + value : "";
}

/* ============================================================
   Errors in plain language
   ============================================================ */
function findRevertData(e, depth) {
  depth = depth || 0;
  if (!e || depth > 5) return null;
  if (typeof e === "string") return /^0x[0-9a-f]{8}/i.test(e) ? e : null;
  if (typeof e.data === "string" && /^0x[0-9a-f]{8}/i.test(e.data)) return e.data;
  return findRevertData(e.data, depth + 1) ||
    findRevertData(e.error, depth + 1) ||
    findRevertData(e.info && e.info.error, depth + 1) ||
    findRevertData(e.cause, depth + 1);
}

function errorName(e) {
  if (e && e.revert && e.revert.name) return e.revert.name;
  const data = findRevertData(e);
  if (!data) return null;
  for (const iface of [loanIface, erc20Iface]) {
    try {
      const parsed = iface.parseError(data);
      if (parsed) return parsed.name;
    } catch (err) { /* not this interface */ }
  }
  return null;
}

function explain(e) {
  if (!e) return "Something went wrong.";
  const inner = e.info && e.info.error;
  const code = e.code;
  if (code === "ACTION_REJECTED" || code === 4001 || (inner && inner.code === 4001)) {
    return "You rejected the request in your wallet. Nothing was sent.";
  }
  if (code === -32002) return "Your wallet already has a request open. Open the wallet to continue.";
  const text = String(e.message || "");
  if (/connection request reset|modal closed|user closed|proposal expired/i.test(text)) {
    return "The WalletConnect request was closed before a wallet approved it. Nothing was connected.";
  }
  if (/project id|projectid|unauthorized|origin not allowed|allowlist/i.test(text)) {
    return "WalletConnect refused this site. Check walletConnect.projectId in config/loro.config.js and add this domain to the project's allowlist on dashboard.reown.com.";
  }
  if (code === "INSUFFICIENT_FUNDS") return "Your wallet does not have enough ETH to pay for this transaction and its gas.";
  const name = errorName(e);
  if (name) return core.describeContractError(name) || "The contract rejected this with " + name + ".";
  if (code === "CALL_EXCEPTION") return "This transaction would fail onchain. Refresh to see the loan's current state.";
  if (code === "NETWORK_ERROR" || code === "SERVER_ERROR" || code === "TIMEOUT") {
    return "The network could not be reached. Check your connection and try again.";
  }
  return String(e.shortMessage || e.message || "Something went wrong.").slice(0, 260);
}

/* ============================================================
   Notice bar and network bar
   ============================================================ */
function notice(message, action) {
  const el = $("#notice");
  if (!message) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false;
  el.textContent = message;
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-ghost app-sm";
    b.textContent = action.label;
    b.addEventListener("click", action.run);
    el.appendChild(b);
  }
}

function renderNetwork() {
  const cfg = S.cfg;
  $("#netName").textContent = cfg.name;
  const link = $("#netContract");
  const dot = $("#netDot");
  if (cfg.contracts.loroLoan) {
    link.textContent = core.shortAddress(cfg.contracts.loroLoan);
    link.title = cfg.contracts.loroLoan;
    const href = explorer("address", cfg.contracts.loroLoan);
    if (href) link.href = href; else link.removeAttribute("href");
  } else {
    link.textContent = "Not deployed";
    link.removeAttribute("href");
  }
  dot.className = "app-dot" + (S.ready ? " is-live" : cfg.deployed ? " is-warn" : "");
}

/* ============================================================
   Wallet
   ============================================================ */
window.addEventListener("eip6963:announceProvider", (event) => {
  const d = event.detail;
  if (!d || !d.provider || !d.info) return;
  if (!S.announced.some((a) => a.info.uuid === d.info.uuid)) S.announced.push(d);
});
window.dispatchEvent(new Event("eip6963:requestProvider"));

function injected() {
  if (S.announced.length) return S.announced.map((a) => ({ name: a.info.name, provider: a.provider }));
  return window.ethereum ? [{ name: "Browser wallet", provider: window.ethereum }] : [];
}

/* ---- WalletConnect ----
   The 2 MB provider bundle is only fetched when someone picks WalletConnect
   or already has a WalletConnect session stored in this browser. */
const WC_BUNDLE = "./vendor/walletconnect-provider-2.24.0.js";
let wcProvider = null;

function walletConnectEnabled() {
  return Boolean(S.cfg.walletConnect && S.cfg.walletConnect.projectId && S.cfg.chainId);
}

function hasStoredWalletConnectSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      if ((localStorage.key(i) || "").indexOf("wc@2") === 0) return true;
    }
  } catch (e) { /* storage blocked */ }
  return false;
}

async function walletConnectProvider() {
  if (wcProvider) return wcProvider;
  const mod = await import(WC_BUNDLE);
  const wc = S.cfg.walletConnect;
  const chainId = Number(S.cfg.chainId);
  const origin = location.origin;
  const meta = wc.metadata || {};
  wcProvider = await mod.EthereumProvider.init({
    projectId: wc.projectId,
    // Optional rather than required: wallets that do not list Robinhood Chain
    // yet can still connect, and are then asked to add or switch to it.
    optionalChains: [chainId],
    rpcMap: S.cfg.rpcUrl ? { [chainId]: S.cfg.rpcUrl } : {},
    showQrModal: true,
    metadata: {
      name: meta.name || "Loro",
      description: meta.description || "",
      url: origin,
      icons: meta.icons && meta.icons.length ? meta.icons : [origin + "/assets/favicon.svg"]
    }
  });
  wcProvider.on("disconnect", () => {
    if (S.eip1193 === wcProvider) resetWallet();
  });
  return wcProvider;
}

function walletOptions() {
  const list = injected().map((w) => ({ name: w.name, kind: "injected", provider: w.provider }));
  if (walletConnectEnabled()) {
    list.push({ name: "WalletConnect", kind: "walletconnect", detail: "Scan a QR code with a mobile wallet" });
  }
  return list;
}

/* Generic chooser built on the review dialog. Resolves the picked option or null. */
function pickDialog(opts) {
  return new Promise((resolve) => {
    const dialog = $("#confirm");
    $("#confirmEyebrow").textContent = opts.eyebrow || "Wallet";
    $("#confirmTitle").textContent = opts.title;
    const rows = $("#confirmRows");
    rows.innerHTML = "";
    (opts.rows || []).forEach((r) => {
      const div = document.createElement("div");
      const dt = document.createElement("dt");
      dt.textContent = r[0];
      const dd = document.createElement("dd");
      dd.textContent = r[1];
      div.appendChild(dt);
      div.appendChild(dd);
      rows.appendChild(div);
    });
    $("#confirmNote").textContent = opts.note || "";
    const steps = $("#confirmSteps");
    steps.innerHTML = "";
    $("#confirmOk").hidden = true;
    let picked = null;
    opts.options.forEach((o) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-ghost app-sm";
      b.textContent = o.name;
      b.addEventListener("click", () => { picked = o; dialog.close("ok"); });
      li.appendChild(b);
      if (o.detail) {
        const small = document.createElement("small");
        small.textContent = o.detail;
        li.appendChild(small);
      }
      steps.appendChild(li);
    });
    dialog.returnValue = "";
    dialog.addEventListener("close", function onClose() {
      dialog.removeEventListener("close", onClose);
      $("#confirmOk").hidden = false;
      resolve(picked);
    });
    dialog.showModal();
  });
}

async function chooseWallet() {
  const list = walletOptions();
  if (list.length <= 1) return list[0] || null;
  return pickDialog({
    title: "Choose a wallet",
    note: "Loro never sees your keys. Your wallet signs every transaction.",
    options: list
  });
}

async function connect() {
  const choice = await chooseWallet();
  if (!choice) {
    if (!walletOptions().length) {
      notice("No browser wallet found. Install a wallet such as MetaMask or Rabby, then reload this page.");
    }
    return false;
  }
  try {
    let provider;
    let accounts;
    if (choice.kind === "walletconnect") {
      provider = await walletConnectProvider();
      if (!provider.session) await provider.connect();
      accounts = provider.accounts;
    } else {
      provider = choice.provider;
      accounts = await provider.request({ method: "eth_requestAccounts" });
    }
    S.walletName = choice.name;
    await attach(provider, accounts);
    return Boolean(S.account);
  } catch (e) {
    notice(explain(e));
    return false;
  }
}

async function walletMenu() {
  const picked = await pickDialog({
    title: core.shortAddress(S.account),
    rows: [["Address", S.account], ["Connected with", S.walletName || "Browser wallet"], ["Network", S.cfg.name]],
    note: S.walletName === "WalletConnect"
      ? "Disconnecting ends the WalletConnect session on this device and in your wallet."
      : "Browser wallets stay authorized for this site until you remove it in the wallet itself.",
    options: [
      { name: "Refresh", kind: "refresh" },
      { name: "Disconnect", kind: "disconnect" }
    ]
  });
  if (!picked) return;
  if (picked.kind === "refresh") return refresh();
  if (S.eip1193 === wcProvider && wcProvider) {
    try { await wcProvider.disconnect(); } catch (e) { /* already gone */ }
  }
  resetWallet();
}

function detachListeners(provider) {
  if (provider && provider.removeListener) {
    provider.removeListener("accountsChanged", onAccounts);
    provider.removeListener("chainChanged", onChain);
  }
}

function resetWallet() {
  detachListeners(S.eip1193);
  S.eip1193 = null;
  S.wallet = null;
  S.signer = null;
  S.account = null;
  S.chainId = null;
  S.walletName = null;
  S.signature = null;
  S.lists.lender = [];
  S.lists.borrower = [];
  updateWalletUi();
  notice(null);
  renderAll();
  refresh(true);
}

function onAccounts(accounts) {
  if (!accounts || !accounts.length) return resetWallet();
  attach(S.eip1193, accounts);
}
function onChain() {
  attach(S.eip1193, S.account ? [S.account] : []);
}

async function attach(provider, accounts) {
  if (S.eip1193 && S.eip1193 !== provider) detachListeners(S.eip1193);
  if (S.eip1193 !== provider && provider.on) {
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
  }
  S.eip1193 = provider;
  S.wallet = new ethers.BrowserProvider(provider, "any");
  S.chainId = Number(await provider.request({ method: "eth_chainId" }));
  S.account = accounts && accounts[0] ? ethers.getAddress(accounts[0]) : null;
  S.signer = S.account ? await S.wallet.getSigner(S.account) : null;
  updateWalletUi();
  if (!S.cfg.deployed) return;
  if (!S.ready) await loadProtocol();
  else await refresh();
}

async function reconnectSilently() {
  await new Promise((r) => setTimeout(r, 60)); // let wallets announce
  if (walletConnectEnabled() && hasStoredWalletConnectSession()) {
    try {
      const provider = await walletConnectProvider();
      if (provider.session && provider.accounts && provider.accounts.length) {
        S.walletName = "WalletConnect";
        await attach(provider, provider.accounts);
        return;
      }
    } catch (e) { /* fall back to browser wallets */ }
  }
  const list = injected();
  if (!list.length) return;
  try {
    const accounts = await list[0].provider.request({ method: "eth_accounts" });
    if (accounts && accounts.length) {
      S.walletName = list[0].name;
      await attach(list[0].provider, accounts);
    }
  } catch (e) { /* stay disconnected */ }
}

function updateWalletUi() {
  const btn = $("#walletBtn");
  btn.classList.remove("is-connected", "is-wrong");
  if (!S.account) {
    btn.textContent = "Connect wallet";
  } else if (S.cfg.chainId && S.chainId !== S.cfg.chainId) {
    btn.textContent = "Switch network";
    btn.classList.add("is-wrong");
    notice("Your wallet is on another network. Switch to " + S.cfg.name + " to continue.",
      { label: "Switch network", run: () => switchNetwork().catch((e) => notice(explain(e))) });
  } else {
    btn.textContent = core.shortAddress(S.account);
    btn.title = S.account;
    btn.classList.add("is-connected");
    if (S.ready) notice(null);
  }
}

async function switchNetwork() {
  const hex = "0x" + Number(S.cfg.chainId).toString(16);
  try {
    await S.eip1193.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (e) {
    const missing = e && (e.code === 4902 || (e.data && e.data.originalError && e.data.originalError.code === 4902));
    if (!missing) throw e;
    if (!S.cfg.rpcUrl) throw new Error("Your wallet does not know " + S.cfg.name + ". Add the network in your wallet first.");
    const params = {
      chainId: hex,
      chainName: S.cfg.name,
      rpcUrls: [S.cfg.rpcUrl],
      nativeCurrency: S.cfg.nativeCurrency
    };
    if (S.cfg.explorerUrl) params.blockExplorerUrls = [S.cfg.explorerUrl];
    await S.eip1193.request({ method: "wallet_addEthereumChain", params: [params] });
  }
  await attach(S.eip1193, S.account ? [S.account] : []);
}

async function ensureReady() {
  if (!S.cfg.deployed) {
    toast("Not deployed", "Loro is not deployed on " + S.cfg.name + " yet.");
    return false;
  }
  if (!S.account && !(await connect())) return false;
  if (S.chainId !== S.cfg.chainId) {
    try { await switchNetwork(); } catch (e) { toast("Wrong network", explain(e)); return false; }
    if (S.chainId !== S.cfg.chainId) return false;
  }
  if (!S.ready) await loadProtocol();
  return S.ready;
}

/* ============================================================
   Chain reads
   ============================================================ */
async function tokenMeta(address) {
  const key = lower(address);
  if (S.tokens.has(key)) return S.tokens.get(key);
  let m;
  const known = (S.cfg.collateral || []).find((c) => lower(c.address) === key);
  if (key === ETH) {
    m = { symbol: S.cfg.nativeCurrency.symbol, decimals: 18, native: true };
  } else {
    try {
      const t = tokenAt(address, reader());
      const decimals = await t.decimals();
      let symbol = "";
      try { symbol = await t.symbol(); } catch (e) { /* optional in ERC20 */ }
      m = { symbol: String(symbol || (known && known.symbol) || core.shortAddress(address)).slice(0, 16), decimals: Number(decimals) };
    } catch (e) {
      m = { symbol: known ? known.symbol : core.shortAddress(address), decimals: known && known.decimals != null ? known.decimals : null };
    }
  }
  S.tokens.set(key, m);
  return m;
}

async function loadProtocol() {
  const p = reader();
  if (!p) {
    S.ready = false;
    renderNetwork();
    notice("Connect a wallet on " + S.cfg.name + " to load offers and loans.");
    renderAll();
    return;
  }
  try {
    const code = await p.getCode(S.cfg.contracts.loroLoan);
    if (code === "0x") {
      S.ready = false;
      notice("No LoroLoan contract exists at the configured address on " + S.cfg.name + ". Check config/loro.config.js.");
      renderNetwork();
      renderAll();
      return;
    }
    const loro = loanAt(p);
    const values = await Promise.all([loro.stablecoin(), loro.feeBps()]);
    const stable = values[0];
    if (S.cfg.stablecoin.address && lower(S.cfg.stablecoin.address) !== lower(stable)) {
      S.ready = false;
      notice("The configured stablecoin does not match LoroLoan.stablecoin(). Nothing will be sent until config/loro.config.js is corrected.");
      renderNetwork();
      return;
    }
    S.feeBps = values[1];
    S.stable = Object.assign({ address: stable }, await tokenMeta(stable));
    // Decimals and symbols of the configured collateral are read from chain,
    // never trusted from config, before the offer form can use them.
    await Promise.all((S.cfg.collateral || []).map((c) => tokenMeta(c.address)));
    S.ready = true;
    renderNetwork();
    renderUnits();
    updateWalletUi();
    if (!S.account || S.chainId === S.cfg.chainId) notice(null);
    await refresh();
  } catch (e) {
    S.ready = false;
    renderNetwork();
    notice("Could not read the Loro contracts. " + explain(e));
  }
}

function normalize(v) {
  const l = v.loan;
  return {
    id: BigInt(v.id),
    lender: l.lender,
    borrower: l.borrower,
    status: Number(l.status),
    duration: BigInt(l.duration),
    auctionWindow: BigInt(l.auctionWindow),
    maturity: BigInt(l.maturity),
    auctionStart: BigInt(l.auctionStart),
    proceedsWithdrawn: Boolean(l.proceedsWithdrawn),
    collateralAsset: l.collateralAsset,
    collateralAmount: BigInt(l.collateralAmount),
    principal: BigInt(l.principal),
    interest: BigInt(l.interest),
    auctionCeiling: BigInt(l.auctionCeiling),
    lenderProceeds: BigInt(l.lenderProceeds),
    debt: BigInt(v.debt),
    fee: BigInt(v.fee)
  };
}

async function queryAll(filter, status, account, cap) {
  const lens = lensAt(reader());
  const out = [];
  let start = 0n;
  for (let page = 0; page < 20; page++) {
    const res = await lens.query(filter, status, account, start, 500n, 100n);
    res[0].forEach((v) => out.push(normalize(v)));
    if (res[1] === 0n || out.length >= (cap || 300)) break;
    start = res[1];
  }
  return out;
}

async function refresh(quiet) {
  if (!S.ready || S.loading || !reader()) return;
  S.loading = true;
  try {
    const block = await reader().getBlock("latest");
    S.offset = Number(block.timestamp) - Math.floor(Date.now() / 1000);
    const zero = ethers.ZeroAddress;
    const results = await Promise.all([
      queryAll(Filter.Status, Status.Offered, zero),
      queryAll(Filter.Status, Status.AuctionOpen, zero),
      queryAll(Filter.Status, Status.Active, zero),
      S.account ? queryAll(Filter.Lender, 0, S.account) : [],
      S.account ? queryAll(Filter.Borrower, 0, S.account) : []
    ]);
    const all = [].concat.apply([], results);
    const assets = Array.from(new Set(all.map((v) => lower(v.collateralAsset))));
    await Promise.all(assets.map(tokenMeta));

    const now = chainNow();
    S.lists.offers = results[0];
    S.lists.auctions = results[1].concat(results[2].filter((v) => core.deriveFlags(v, now).auctionOpenable));
    S.lists.lender = results[3];
    S.lists.borrower = results[4];
    S.byId = new Map(all.map((v) => [v.id.toString(), v]));

    // Rebuilding the cards on every poll would steal focus and hover from
    // whoever is using them. Only re-render when chain data changed; tick()
    // still re-renders when a time boundary is crossed.
    const signature = JSON.stringify(
      [S.account, S.lists.offers, S.lists.auctions, S.lists.lender, S.lists.borrower],
      (k, val) => (typeof val === "bigint" ? val.toString() : val)
    );
    if (signature !== S.signature) {
      S.signature = signature;
      renderAll();
    }
  } catch (e) {
    if (!quiet) notice("Could not load loans. " + explain(e));
  } finally {
    S.loading = false;
  }
}

/* ============================================================
   Rendering
   ============================================================ */
function badge(v, f) {
  switch (v.status) {
    case Status.Offered: return ["Open offer", "is-open"];
    case Status.Active: return f.repayable ? ["Active", "is-open"] : ["Past deadline", "is-due"];
    case Status.AuctionOpen: return f.fillable ? ["Auction live", "is-due"] : ["Auction ended unfilled", "is-due"];
    default: return [core.statusLabel(v.status), "is-closed"];
  }
}

function row(label, value) {
  return "<div><dt>" + esc(label) + "</dt><dd>" + esc(value) + "</dd></div>";
}

function button(action, v, label, primary) {
  return '<button type="button" class="btn ' + (primary ? "btn-accent" : "btn-ghost") +
    ' app-sm" data-action="' + action + '" data-id="' + v.id + '">' + esc(label) + "</button>";
}

function card(v) {
  const now = chainNow();
  const f = core.deriveFlags(v, now);
  const coll = meta(v.collateralAsset);
  const st = S.stable;
  const b = badge(v, f);
  const role = isMe(v.lender) ? "You lend" : isMe(v.borrower) ? "You borrow" : "";

  let rows = row("Collateral", amt(v.collateralAmount, coll)) + row("Repay", amt(v.debt, st));
  if (v.status === Status.Offered) {
    rows += row("Term", core.formatDuration(v.duration));
  } else {
    rows += row("Deadline", core.formatDate(v.maturity));
  }
  rows += row("Implied rate", core.impliedAprPercent(v.principal, v.interest, v.duration) + "% APR");
  rows += row("Auction", fmt(v.auctionCeiling, st, 2) + " falling to " + fmt(v.debt, st, 2) + " over " + core.formatDuration(v.auctionWindow));
  if (v.status !== Status.Offered) rows += row(isMe(v.lender) ? "Borrower" : "Lender", core.shortAddress(isMe(v.lender) ? v.borrower : v.lender));
  if (v.status === Status.Repaid || v.status === Status.Settled) {
    rows += row("Lender proceeds", amt(v.lenderProceeds, st) + (v.proceedsWithdrawn ? " withdrawn" : ""));
  }

  let live = "";
  if (v.status === Status.AuctionOpen && f.fillable) {
    live = '<div class="lc-live"><div class="lc-live-head"><span class="lc-live-label">Live price</span>' +
      '<span class="mono lc-id" data-countdown="' + f.auctionEnd + '" data-prefix="ends in ">' + "</span></div>" +
      '<span class="lc-live-price" data-live-price="' + v.id + '"></span>' +
      '<span class="lc-track"><span class="lc-track-fill" data-live-track="' + v.id + '"></span></span></div>';
  } else if (v.status === Status.Active && f.repayable) {
    live = '<p class="lc-note">Repay <span class="mono" data-countdown="' + v.maturity + '" data-prefix="within "></span> to keep the collateral.</p>';
  } else if (v.status === Status.Active) {
    live = '<p class="lc-note">The deadline passed without repayment. Anyone can open the auction now.</p>';
  } else if (v.status === Status.AuctionOpen) {
    live = '<p class="lc-note">Nobody filled the auction. Only the lender can claim the collateral.</p>';
  }

  let actions = "";
  if (v.status === Status.Offered) {
    actions += isMe(v.lender) ? button("cancel", v, "Cancel offer") : button("accept", v, "Accept offer", true);
  }
  if (f.repayable && isMe(v.borrower)) actions += button("repay", v, "Repay " + fmt(v.debt, st, 2) + " " + st.symbol, true);
  if (f.auctionOpenable) actions += button("open", v, "Open auction", true);
  if (f.fillable) actions += button("fill", v, "Buy collateral", true);
  if (f.claimable && isMe(v.lender)) actions += button("claim", v, "Claim collateral", true);
  if (f.proceedsWithdrawable && isMe(v.lender)) actions += button("withdraw", v, "Withdraw " + fmt(v.lenderProceeds, st, 2) + " " + st.symbol, true);

  return '<article class="loan-card">' +
    '<div class="lc-head"><span><span class="mono lc-id">#' + v.id + "</span>" +
    (role ? '<span class="lc-role">' + role + "</span>" : "") + "</span>" +
    '<span class="badge ' + b[1] + '">' + b[0] + "</span></div>" +
    "<div><p class=\"lc-amount\">" + esc(fmt(v.principal, st, 2)) + "<span>" + esc(st.symbol) + "</span></p>" +
    '<p class="lc-sub">Principal, plus ' + esc(amt(v.interest, st, 2)) + " fixed interest</p></div>" +
    '<dl class="lc-grid">' + rows + "</dl>" + live +
    (actions ? '<div class="lc-actions">' + actions + "</div>" : "") +
    "</article>";
}

function empty(message) {
  return '<p class="app-empty">' + esc(message) + "</p>";
}

function renderList(el, items, emptyText, needsAccount) {
  if (!S.cfg.deployed) { el.innerHTML = empty("Nothing to show until Loro is deployed on " + S.cfg.name + "."); return; }
  if (!S.ready) { el.innerHTML = empty("Connect a wallet on " + S.cfg.name + " to load this list."); return; }
  if (needsAccount && !S.account) { el.innerHTML = empty("Connect a wallet to see your positions."); return; }
  el.innerHTML = items.length ? items.map(card).join("") : empty(emptyText);
}

function countText(n, word) {
  return S.ready ? n + " " + word + (n === 1 ? "" : "s") : "";
}

function renderAll() {
  renderList($("#offersList"), S.lists.offers, "No open offers right now.", false);
  renderList($("#lenderList"), S.lists.lender, "You have no offers or loans as a lender yet.", true);
  renderList($("#borrowerList"), S.lists.borrower, "You have not borrowed on Loro yet.", true);
  renderList($("#auctionList"), S.lists.auctions, "No loans are past their deadline.", false);
  $("#offersCount").textContent = countText(S.lists.offers.length, "offer");
  $("#loansCount").textContent = S.account ? countText(S.lists.borrower.length, "loan") : "";
  $("#auctionsCount").textContent = countText(S.lists.auctions.length, "loan");
  S.flagsKey = flagsKey();
  tick();
}

function flagsKey() {
  const now = chainNow();
  let key = "";
  S.byId.forEach((v, id) => {
    const f = core.deriveFlags(v, now);
    key += id + (f.repayable ? "r" : "") + (f.auctionOpenable ? "o" : "") + (f.fillable ? "f" : "") + (f.claimable ? "c" : "") + ";";
  });
  return key;
}

/* Every second: move live prices and countdowns. When a loan crosses
   a time boundary, re-render so its buttons match what the contract
   will accept. */
function tick() {
  if (!S.ready) return;
  const now = chainNow();
  $$("[data-live-price]").forEach((el) => {
    const v = S.byId.get(el.getAttribute("data-live-price"));
    if (!v) return;
    const price = core.auctionPriceAt(v.debt, v.auctionCeiling, v.auctionStart, v.auctionWindow, now);
    el.textContent = amt(price, S.stable, 2);
    const track = $('[data-live-track="' + v.id + '"]');
    if (track) {
      const elapsed = now > v.auctionStart ? now - v.auctionStart : 0n;
      const pct = v.auctionWindow ? Number((elapsed * 10000n) / v.auctionWindow) / 100 : 100;
      track.style.width = Math.min(100, pct) + "%";
    }
  });
  $$("[data-countdown]").forEach((el) => {
    const until = BigInt(el.getAttribute("data-countdown"));
    el.textContent = (el.getAttribute("data-prefix") || "") + core.formatCountdown(until >= now ? until - now + 1n : 0n);
  });
  const key = flagsKey();
  if (key !== S.flagsKey) {
    S.flagsKey = key;
    renderAll();
  }
}

function renderUnits() {
  $$('[data-unit="stable"]').forEach((el) => { el.textContent = S.stable ? "(" + S.stable.symbol + ")" : ""; });
  updateOfferSummary();
}

/* ============================================================
   Review dialog and transaction progress
   ============================================================ */
function confirmDialog(flow, steps) {
  return new Promise((resolve) => {
    const dialog = $("#confirm");
    $("#confirmEyebrow").textContent = flow.eyebrow || "Review";
    $("#confirmTitle").textContent = flow.title;
    const rows = $("#confirmRows");
    rows.innerHTML = "";
    flow.rows.forEach((r) => {
      const div = document.createElement("div");
      if (r[2]) div.className = "is-strong";
      const dt = document.createElement("dt");
      dt.textContent = r[0];
      const dd = document.createElement("dd");
      dd.textContent = r[1];
      div.appendChild(dt);
      div.appendChild(dd);
      rows.appendChild(div);
    });
    const list = $("#confirmSteps");
    list.innerHTML = "";
    steps.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s.label;
      const small = document.createElement("small");
      small.textContent = s.detail || "";
      li.appendChild(small);
      list.appendChild(li);
    });
    $("#confirmNote").textContent = flow.note || "";
    $("#confirmOk").textContent = steps.length > 1 ? "Continue (" + steps.length + " wallet prompts)" : "Continue in wallet";
    dialog.returnValue = "";
    dialog.addEventListener("close", function onClose() {
      dialog.removeEventListener("close", onClose);
      resolve(dialog.returnValue === "ok");
    });
    dialog.showModal();
  });
}

function showTx(title, steps) {
  $("#tx").hidden = false;
  $("#txTitle").textContent = title;
  $("#txMsg").textContent = "";
  $("#txMsg").className = "app-tx-msg";
  const list = $("#txSteps");
  list.innerHTML = "";
  steps.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s.label;
    li.appendChild(document.createElement("small"));
    list.appendChild(li);
  });
}

function setStep(i, state, message, hash) {
  const li = $$("#txSteps li")[i];
  if (!li) return;
  li.className = "is-" + state;
  const small = li.querySelector("small");
  small.textContent = message || "";
  const href = hash && explorer("tx", hash);
  if (href) {
    small.appendChild(document.createTextNode(" "));
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "View transaction";
    small.appendChild(a);
  } else if (hash) {
    small.appendChild(document.createTextNode(" " + core.shortAddress(hash)));
  }
}

function txMessage(text, kind) {
  const el = $("#txMsg");
  el.textContent = text;
  el.className = "app-tx-msg" + (kind ? " is-" + kind : "");
}

function toast(title, message) {
  showTx(title, []);
  txMessage(message, "error");
}

async function runFlow(flow) {
  if (!(await ensureReady())) return;
  let steps;
  try {
    steps = (await Promise.all(flow.steps)).filter(Boolean);
  } catch (e) {
    toast(flow.title, explain(e));
    return;
  }
  if (!(await confirmDialog(flow, steps))) return;

  showTx(flow.title, steps);
  for (let i = 0; i < steps.length; i++) {
    setStep(i, "active", "Confirm in your wallet.");
    try {
      if (S.chainId !== S.cfg.chainId) throw new Error("Your wallet switched networks. Switch back to " + S.cfg.name + " and try again.");
      const tx = await steps[i].run(S.signer);
      setStep(i, "active", "Submitted. Waiting for the network to confirm.", tx.hash);
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("The transaction was included but reverted.");
      setStep(i, "done", "Confirmed.", tx.hash);
    } catch (e) {
      const message = explain(e);
      setStep(i, "failed", message);
      txMessage(message, "error");
      await refresh(true);
      return;
    }
  }
  txMessage(flow.success, "ok");
  await refresh(true);
}

/* Approval of exactly `amount`, only when the current allowance is short. */
async function approvalStep(token, m, amount) {
  const current = await tokenAt(token, reader()).allowance(S.account, S.cfg.contracts.loroLoan);
  if (current >= amount) return null;
  return {
    label: "Approve " + amt(amount, m),
    detail: "ERC20 approve. Lets LoroLoan move exactly this amount from your wallet, nothing more.",
    run: (signer) => tokenAt(token, signer).approve(S.cfg.contracts.loroLoan, amount)
  };
}

async function balanceOf(asset) {
  if (lower(asset) === ETH) return reader().getBalance(S.account);
  return tokenAt(asset, reader()).balanceOf(S.account);
}

async function requireBalance(asset, m, needed, what) {
  const have = await balanceOf(asset);
  if (have >= needed) return true;
  toast("Insufficient balance", "You need " + amt(needed, m) + " " + what + ". Your wallet holds " + amt(have, m) + ".");
  return false;
}

/* ============================================================
   Protocol actions
   ============================================================ */
const loanWith = (signer) => loanAt(signer);

async function actAccept(v) {
  if (!(await ensureReady())) return;
  const coll = meta(v.collateralAsset);
  const st = S.stable;
  if (isMe(v.lender)) return toast("Cannot accept", core.describeContractError("SelfBorrow"));
  if (!(await requireBalance(v.collateralAsset, coll, v.collateralAmount, "to lock as collateral"))) return;
  const native = lower(v.collateralAsset) === ETH;
  runFlow({
    eyebrow: "Offer #" + v.id,
    title: "Borrow " + amt(v.principal, st),
    rows: [
      ["You lock", amt(v.collateralAmount, coll), true],
      ["You receive now", amt(v.principal, st), true],
      ["You repay", amt(v.debt, st)],
      ["Repay by", "about " + core.formatDate(chainNow() + v.duration)],
      ["If not repaid", "Collateral is auctioned"],
      ["Contract call", "LoroLoan.acceptOffer(" + v.id + ")"]
    ],
    steps: [
      native ? null : approvalStep(v.collateralAsset, coll, v.collateralAmount),
      {
        label: "Accept offer #" + v.id,
        detail: native
          ? "Sends exactly " + amt(v.collateralAmount, coll) + " with the call and returns the principal to you."
          : "Locks the collateral and sends the principal to you in the same transaction.",
        run: (signer) => loanWith(signer).acceptOffer(v.id, { value: native ? v.collateralAmount : 0n })
      }
    ],
    note: "The deadline is fixed when your transaction is included: that second plus the " + core.formatDuration(v.duration) + " term. It never moves.",
    success: "Loan #" + v.id + " is active. " + amt(v.principal, st) + " is in your wallet."
  });
}

async function actRepay(v) {
  if (!(await ensureReady())) return;
  const st = S.stable;
  const coll = meta(v.collateralAsset);
  if (chainNow() > v.maturity) return toast("Cannot repay", core.describeContractError("LoanMatured"));
  if (!(await requireBalance(st.address, st, v.debt, "to repay"))) return;
  runFlow({
    eyebrow: "Loan #" + v.id,
    title: "Repay " + amt(v.debt, st),
    rows: [
      ["You pay", amt(v.debt, st), true],
      ["You get back", amt(v.collateralAmount, coll), true],
      ["Deadline", core.formatDate(v.maturity)],
      ["Contract call", "LoroLoan.repay(" + v.id + ")"]
    ],
    steps: [
      approvalStep(st.address, st, v.debt),
      {
        label: "Repay loan #" + v.id,
        detail: "Pays principal plus interest and returns your collateral.",
        run: (signer) => loanWith(signer).repay(v.id)
      }
    ],
    note: "Repayment must be included in a block no later than the deadline second.",
    success: "Loan #" + v.id + " is repaid. Your collateral is back in your wallet."
  });
}

async function actCancel(v) {
  runFlow({
    eyebrow: "Offer #" + v.id,
    title: "Cancel offer #" + v.id,
    rows: [
      ["Returned to you", amt(v.principal, S.stable), true],
      ["Contract call", "LoroLoan.cancelOffer(" + v.id + ")"]
    ],
    steps: [{ label: "Cancel offer #" + v.id, detail: "Nothing is sent. The escrowed principal comes back to you.", run: (signer) => loanWith(signer).cancelOffer(v.id) }],
    note: "If a borrower accepts first, cancelling fails and nothing changes.",
    success: "Offer #" + v.id + " is cancelled and its principal is back in your wallet."
  });
}

async function actOpen(v) {
  const st = S.stable;
  runFlow({
    eyebrow: "Loan #" + v.id,
    title: "Open the auction",
    rows: [
      ["Collateral", amt(v.collateralAmount, meta(v.collateralAsset))],
      ["Starting price", amt(v.auctionCeiling, st)],
      ["Falls to", amt(v.debt, st)],
      ["Over", core.formatDuration(v.auctionWindow)],
      ["Contract call", "LoroLoan.openAuction(" + v.id + ")"]
    ],
    steps: [{ label: "Open auction for loan #" + v.id, detail: "Nothing is sent except gas. Anyone may do this once the deadline has passed.", run: (signer) => loanWith(signer).openAuction(v.id) }],
    success: "The auction for loan #" + v.id + " is open."
  });
}

async function actFill(v) {
  if (!(await ensureReady())) return;
  const st = S.stable;
  const coll = meta(v.collateralAsset);
  const now = chainNow();
  if (!core.deriveFlags(v, now).fillable) return toast("Cannot buy", core.describeContractError("AuctionExpired"));
  const price = core.auctionPriceAt(v.debt, v.auctionCeiling, v.auctionStart, v.auctionWindow, now);
  if (!(await requireBalance(st.address, st, price, "to buy this collateral"))) return;
  runFlow({
    eyebrow: "Loan #" + v.id,
    title: "Buy " + amt(v.collateralAmount, coll),
    rows: [
      ["You pay at most", amt(price, st), true],
      ["You receive", amt(v.collateralAmount, coll), true],
      ["Price falls to", amt(v.debt, st)],
      ["Auction ends", core.formatDate(v.auctionStart + v.auctionWindow)],
      ["Contract call", "LoroLoan.fillAuction(" + v.id + ")"]
    ],
    steps: [
      approvalStep(st.address, st, price),
      { label: "Fill auction for loan #" + v.id, detail: "Pays the price at the block that includes this transaction and sends you the collateral.", run: (signer) => loanWith(signer).fillAuction(v.id) }
    ],
    note: "The price only falls, so you pay this amount or less. The contract computes it; this page only estimates it.",
    success: "You bought the collateral of loan #" + v.id + "."
  });
}

async function actClaim(v) {
  runFlow({
    eyebrow: "Loan #" + v.id,
    title: "Claim collateral",
    rows: [
      ["You receive", amt(v.collateralAmount, meta(v.collateralAsset)), true],
      ["Contract call", "LoroLoan.claimCollateral(" + v.id + ")"]
    ],
    steps: [{ label: "Claim collateral of loan #" + v.id, detail: "No payment. Available only to the lender once the auction closed unfilled.", run: (signer) => loanWith(signer).claimCollateral(v.id) }],
    success: "The collateral of loan #" + v.id + " is in your wallet."
  });
}

async function actWithdraw(v) {
  runFlow({
    eyebrow: "Loan #" + v.id,
    title: "Withdraw proceeds",
    rows: [
      ["You receive", amt(v.lenderProceeds, S.stable), true],
      ["Protocol fee already taken", amt(v.fee, S.stable)],
      ["Contract call", "LoroLoan.withdrawProceeds(" + v.id + ")"]
    ],
    steps: [{ label: "Withdraw from loan #" + v.id, detail: "Sends the stablecoin credited to this loan to your wallet.", run: (signer) => loanWith(signer).withdrawProceeds(v.id) }],
    success: amt(v.lenderProceeds, S.stable) + " from loan #" + v.id + " is in your wallet."
  });
}

const ACTIONS = { accept: actAccept, repay: actRepay, cancel: actCancel, open: actOpen, fill: actFill, claim: actClaim, withdraw: actWithdraw };

/* ============================================================
   Offer form
   ============================================================ */
const OTHER = "other";

function setupForm() {
  const select = $("#fCollateral");
  select.innerHTML = "";
  (S.cfg.collateral || []).forEach((c) => {
    const o = document.createElement("option");
    o.value = c.address;
    o.textContent = c.name ? c.symbol + "  " + c.name : c.symbol;
    select.appendChild(o);
  });
  const other = document.createElement("option");
  other.value = OTHER;
  other.textContent = "Other ERC20 by address";
  select.appendChild(other);

  select.addEventListener("change", async () => {
    $("#fCustomWrap").hidden = select.value !== OTHER;
    if (S.ready && select.value !== OTHER) await tokenMeta(select.value);
    updateOfferSummary();
  });
  $("#fCustom").addEventListener("change", async () => {
    const a = $("#fCustom").value.trim();
    if (S.ready && ethers.isAddress(a)) await tokenMeta(a);
    updateOfferSummary();
  });
  $$("#offerForm input, #offerForm select").forEach((el) => el.addEventListener("input", updateOfferSummary));
  $("#offerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    actCreate();
  });
}

function selectedCollateral() {
  const value = $("#fCollateral").value;
  const address = value === OTHER ? $("#fCustom").value.trim() : value;
  return { address, custom: value === OTHER };
}

/* Mirrors every check LoroLoan.createOffer performs, so the user sees a
   plain reason before a wallet prompt. The contract still decides. */
function readOffer() {
  if (!S.stable) throw new Error("Connect a wallet on " + S.cfg.name + " first.");
  const st = S.stable;
  const c = selectedCollateral();
  if (!ethers.isAddress(c.address)) throw new Error("Enter a valid collateral token address.");
  const collateralAsset = ethers.getAddress(c.address);
  if (lower(collateralAsset) === lower(st.address)) throw new Error(core.describeContractError("InvalidCollateralAsset"));
  const cm = meta(collateralAsset);
  if (!cm || cm.decimals == null) throw new Error("Could not read that token. Check the address is an ERC20 on " + S.cfg.name + ".");

  const collateralAmount = core.parseUnits($("#fCollAmount").value, cm.decimals);
  const principal = core.parseUnits($("#fPrincipal").value, st.decimals);
  const interestText = $("#fInterest").value.trim();
  const interest = interestText === "" ? 0n : core.parseUnits(interestText, st.decimals);
  if (collateralAmount === 0n || principal === 0n) throw new Error(core.describeContractError("ZeroAmount"));

  const durationN = Number($("#fDuration").value);
  const windowN = Number($("#fWindow").value);
  if (!Number.isInteger(durationN) || durationN <= 0) throw new Error("Enter the term as a whole number.");
  if (!Number.isInteger(windowN) || windowN <= 0) throw new Error("Enter the auction window as a whole number.");
  const duration = durationN * Number($("#fDurationUnit").value);
  const window = windowN * Number($("#fWindowUnit").value);
  if (duration > MAX_DURATION) throw new Error(core.describeContractError("InvalidDuration"));
  if (window > MAX_WINDOW) throw new Error(core.describeContractError("InvalidAuctionWindow"));

  const debt = principal + interest;
  const ceilingText = $("#fCeiling").value.trim();
  const auctionCeiling = ceilingText === "" ? debt : core.parseUnits(ceilingText, st.decimals);
  if (auctionCeiling < debt) throw new Error(core.describeContractError("CeilingBelowDebt"));

  return { collateralAsset, cm, collateralAmount, principal, interest, debt, auctionCeiling, duration: BigInt(duration), window: BigInt(window) };
}

function updateOfferSummary() {
  const unit = $('[data-unit="collateral"]');
  const summary = $("#offerSummary");
  const error = $("#offerError");
  const c = selectedCollateral();
  const cm = ethers && ethers.isAddress(c.address) ? meta(c.address) : null;
  unit.textContent = cm && cm.decimals != null ? "(" + cm.symbol + ")" : "";
  summary.innerHTML = "";
  error.hidden = true;
  if (!S.ready) return;
  const filled = $("#fCollAmount").value && $("#fPrincipal").value;
  if (!filled) return;
  try {
    const o = readOffer();
    const fee = core.feeOn(o.interest, S.feeBps);
    const st = S.stable;
    summary.innerHTML =
      row("You deposit now", amt(o.principal, st)) +
      row("Borrower locks", amt(o.collateralAmount, o.cm)) +
      row("Borrower repays", amt(o.debt, st)) +
      row("Implied rate (informational)", core.impliedAprPercent(o.principal, o.interest, o.duration) + "% APR") +
      row("Protocol fee on close", amt(fee, st)) +
      '<div class="is-strong"><dt>You receive if repaid</dt><dd>' + esc(amt(o.debt - fee, st)) + "</dd></div>" +
      row("If not repaid", "Auction from " + fmt(o.auctionCeiling, st, 2) + " to " + fmt(o.debt, st, 2));
  } catch (e) {
    error.textContent = e.message;
    error.hidden = false;
  }
}

async function actCreate() {
  if (!(await ensureReady())) return;
  const c = selectedCollateral();
  if (c.custom && ethers.isAddress(c.address)) {
    const code = await reader().getCode(c.address);
    if (code === "0x") return toast("Invalid collateral", core.describeContractError("InvalidCollateralAsset"));
    S.tokens.delete(lower(c.address));
  }
  if (ethers.isAddress(c.address)) await tokenMeta(c.address);
  let o;
  try {
    o = readOffer();
  } catch (e) {
    $("#offerError").textContent = e.message;
    $("#offerError").hidden = false;
    return;
  }
  const st = S.stable;
  if (!(await requireBalance(st.address, st, o.principal, "to fund this offer"))) return;
  const fee = core.feeOn(o.interest, S.feeBps);
  runFlow({
    eyebrow: "New offer",
    title: "Lend " + amt(o.principal, st),
    rows: [
      ["You deposit now", amt(o.principal, st), true],
      ["Borrower locks", amt(o.collateralAmount, o.cm)],
      ["Borrower repays", amt(o.debt, st)],
      ["Term", core.formatDuration(o.duration)],
      ["Auction", fmt(o.auctionCeiling, st, 2) + " to " + fmt(o.debt, st, 2) + " over " + core.formatDuration(o.window)],
      ["Protocol fee on close", amt(fee, st)],
      ["Contract call", "LoroLoan.createOffer"]
    ],
    steps: [
      approvalStep(st.address, st, o.principal),
      {
        label: "Create offer",
        detail: "Escrows your principal in LoroLoan. You can cancel until a borrower accepts.",
        run: (signer) => loanWith(signer).createOffer(o.collateralAsset, o.collateralAmount, o.principal, o.interest, o.auctionCeiling, o.duration, o.window)
      }
    ],
    note: "The contract does not know what the collateral is worth. The amount you ask for is the only protection you have if the borrower does not repay.",
    success: "Your offer is live. Borrowers can accept it now."
  });
}

/* ============================================================
   Tabs and wiring
   ============================================================ */
function showTab() {
  const tabs = ["borrow", "lend", "loans", "auctions"];
  const wanted = (location.hash || "").slice(1);
  const tab = tabs.indexOf(wanted) !== -1 ? wanted : "borrow";
  $$(".app-panel").forEach((p) => { p.hidden = p.getAttribute("data-panel") !== tab; });
  $$(".app-tab").forEach((a) => {
    const on = a.getAttribute("data-tab") === tab;
    a.classList.toggle("is-on", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

function wire() {
  window.addEventListener("hashchange", showTab);
  showTab();

  $("#walletBtn").addEventListener("click", async () => {
    if (!S.account) return connect();
    if (S.cfg.chainId && S.chainId !== S.cfg.chainId) {
      try { await switchNetwork(); } catch (e) { notice(explain(e)); }
      return;
    }
    walletMenu();
  });
  $$("[data-refresh]").forEach((b) => b.addEventListener("click", () => refresh()));
  $("#txClose").addEventListener("click", () => { $("#tx").hidden = true; });
  $("#app").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const v = S.byId.get(btn.getAttribute("data-id"));
    const fn = ACTIONS[btn.getAttribute("data-action")];
    if (v && fn) fn(v);
  });
}

async function init() {
  S.cfg = await loadConfig();
  renderNetwork();
  wire();
  setupForm();
  if (!ethers) {
    notice("The wallet library failed to load. Reload the page.");
    return;
  }
  if (!S.cfg.deployed) {
    notice("Loro is not deployed on " + S.cfg.name + " yet. Offers and loans appear here once the contracts are live.");
    renderAll();
    return;
  }
  if (S.cfg.rpcUrl) {
    S.rpc = new ethers.JsonRpcProvider(S.cfg.rpcUrl, S.cfg.chainId, { staticNetwork: true });
  }
  await reconnectSilently();
  if (!S.ready) await loadProtocol();
  setInterval(tick, 1000);
  setInterval(() => refresh(true), REFRESH_MS);
}

init();
