/* ============================================================
   LORO — deployment configuration
   The single source of truth for networks, contract addresses
   and assets. Nothing else in the codebase hardcodes a contract
   address, chain id, or RPC url.

   Every field left as null or "" is intentional: it means
   "not deployed yet", and the site renders its empty state.
   Fill values in only from the actual deployment output and the
   official chain documentation. Never guess an address.
   ============================================================ */

const ETH = "0x0000000000000000000000000000000000000000";

export const networks = {
  robinhood: {
    key: "robinhood",
    name: "Robinhood Chain",
    chainId: 4663,        // verified against the RPC endpoint
    rpcUrl: "https://rpc.mainnet.chain.robinhood.com", // public RPC for reads, no secrets
    explorerUrl: "https://robinhoodchain.blockscout.com", // no trailing slash
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    contracts: {
      // Deployed with script/deploy-mainnet.sh, see loro-contracts/deployments/4663.json
      loroLoan: "0xc04c65fd403022C465a0513765416Bf4681C71A1",
      loroLens: "0x5E5C1095Dc24fc4968490bE1EeCE3447D235710D"
    },
    // The principal stablecoin is fixed per LoroLoan deployment. The app
    // reads the real address from LoroLoan.stablecoin() and refuses to run
    // if this value is set and disagrees.
    // USDG checked onchain (symbol USDG, 6 decimals). Confirm on the Paxos list.
    stablecoin: { address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", symbol: "USDG", decimals: 6 },
    // Collateral shortcuts shown in the offer form. Any standard ERC20 can
    // still be entered by address. Add Stock Tokens only from verified,
    // official token addresses.
    collateral: [
      { address: ETH, symbol: "ETH", name: "Ether", decimals: 18 }
    ]
  },

  // Local Anvil. Only selectable on localhost. Addresses come from
  // config/loro.local.js, written by `node tools/sync-contracts.mjs --local`.
  local: {
    key: "local",
    name: "Anvil (local)",
    chainId: 31337,
    rpcUrl: "http://127.0.0.1:8545",
    explorerUrl: "",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    contracts: { loroLoan: null, loroLens: null },
    stablecoin: { address: null, symbol: "", decimals: null },
    collateral: [{ address: ETH, symbol: "ETH", name: "Ether", decimals: 18 }]
  }
};

export const defaultNetwork = "robinhood";
export const docsUrl = "";

/* WalletConnect (Reown). The project id is a public identifier, not a
   secret: create one at https://dashboard.reown.com and add the site's
   domains (e.g. your-site.vercel.app, localhost) to its allowlist there.
   Leave projectId empty to offer browser wallets only. */
export const walletConnect = {
  projectId: "",
  metadata: {
    name: "Loro",
    description: "Borrow without selling. Fixed rate, fixed term, fully onchain.",
    icons: []   // absolute url(s) to a square icon; filled from the page origin if empty
  }
};

function isLocalHost() {
  return typeof location !== "undefined" &&
    ["localhost", "127.0.0.1", "[::1]"].indexOf(location.hostname) !== -1;
}

/* Resolve the active network. `?network=<key>` picks one explicitly;
   localhost defaults to the local profile. The local profile is never
   selectable from a public host. */
export async function loadConfig() {
  let key = defaultNetwork;
  try {
    const wanted = new URLSearchParams(location.search).get("network");
    if (wanted && networks[wanted]) key = wanted;
    else if (isLocalHost()) key = "local";
  } catch (e) { /* not in a browser */ }
  if (key === "local" && !isLocalHost()) key = defaultNetwork;

  const net = JSON.parse(JSON.stringify(networks[key]));
  if (key === "local") {
    try {
      const mod = await import("./loro.local.js");
      Object.assign(net, mod.localDeployment);
    } catch (e) { /* no local deployment synced yet */ }
  }
  net.docsUrl = docsUrl;
  net.walletConnect = JSON.parse(JSON.stringify(walletConnect));
  net.deployed = Boolean(net.chainId && net.contracts.loroLoan && net.contracts.loroLens);
  return net;
}

export default loadConfig;
