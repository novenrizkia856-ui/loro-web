# Loro web

Static landing page and app for Loro, a permissionless, fixed rate, fixed term,
isolated lending protocol. Lock a Stock Token or ETH, borrow stablecoin at a rate
and term fixed on day one. Repay by the deadline, or the collateral is auctioned.

No build step. No server. No API routes. No backend. Plain HTML, CSS and
JavaScript. The chain is the source of truth.

## Layout

```
index.html                 landing page
app.html                   the app: borrow, lend, my loans, auctions
docs.html                  protocol documentation (served at /docs)
config/loro.config.js      networks, addresses, assets  (the only place these live)
config/loro.local.js       GENERATED Anvil addresses, localhost only, not deployed
assets/base.css            tokens, reset, header, buttons, sky, cursor (both pages)
assets/landing.css         landing sections and their motion
assets/app.css             app components, built on base.css tokens
assets/landing.js          landing config binding, 3D hero objects, scroll motion, reveals
assets/cursor.js           custom cursor, magnetic controls, card tilt (every page)
assets/docs.css            documentation layout
assets/docs.js             documentation contents menu and deployment values
assets/content.js          landing marquee copy
assets/app.js              wallet, reads, transactions
assets/loro-core.js        protocol math and units, no DOM, mirrors the contract
assets/loro-abi.js         GENERATED ABIs from loro-contracts
assets/vendor/             three.js (hero objects), ethers 6.15.0,
                           WalletConnect provider 2.24.0 (single ESM bundle, lazy loaded)
tests/                     node tests for loro-core, Solidity computed vectors
tools/sync-contracts.mjs   copies ABIs, vectors and local addresses from loro-contracts
tools/serve.mjs            dependency free static server for local development
vercel.json                static hosting config
.vercelignore              keeps tools, tests and local config out of the deploy
```

## The app

`app.html` connects any injected browser wallet (EIP 6963 discovery, with
`window.ethereum` as fallback) and, when a project id is configured, any mobile or
desktop wallet through WalletConnect (QR code). Nothing is custodied and no key
ever touches the page.

WalletConnect details:

- The provider bundle (2 MB) is fetched only when a visitor picks WalletConnect or
  already has a WalletConnect session in that browser; everyone else never loads it.
- Robinhood Chain is requested as an optional chain, so wallets that do not list it
  yet can still connect; the app then asks the wallet to switch or add the chain.
- Clicking the connected address opens a small menu with Disconnect, which also ends
  the WalletConnect session in the wallet.
- To rebuild the bundle for a newer version:

  ```bash
  npm i @walletconnect/ethereum-provider@<version> esbuild
  echo 'export { EthereumProvider } from "@walletconnect/ethereum-provider";' > entry.js
  npx esbuild entry.js --bundle --format=esm --platform=browser --target=es2020 --minify \
    --define:process.env.NODE_ENV='"production"' --define:global=globalThis \
    --outfile=assets/vendor/walletconnect-provider-<version>.js
  ```

  then update `WC_BUNDLE` in `assets/app.js`. Keep the version in the file name:
  `vercel.json` caches `assets/vendor/` as immutable for a year.

| Section | What a wallet can do |
| --- | --- |
| Borrow | browse open offers, inspect terms, accept (approve collateral, then accept; ETH is sent with the call) |
| Lend | create an offer (approve principal, then create), see own offers and loans, cancel an open offer, open an auction, claim collateral after an unfilled auction, withdraw proceeds |
| My loans | see active loans with a live deadline countdown, repay (approve, then repay) |
| Auctions | see loans past their deadline and open auctions, open an auction, watch the live price, fill |

Every transaction is shown in a review dialog before any wallet prompt: what it
does, which asset and how much is sent or received, and which contract function is
called. Approvals are for the exact amount only. Progress is shown per step, and
failures are explained in plain language: rejected in wallet, insufficient balance
(checked before prompting), missing allowance (added as a step), wrong network
(offers to switch), and every LoroLoan custom error.

Reads go through `LoroLens` using the connected wallet, or the optional public
`rpcUrl` in config before a wallet connects. Action buttons follow the same time
rules as the contract (repay while `now <= maturity`, fill while
`now <= auctionEnd`, and so on), evaluated against chain time every second.

### Auction price

The live price is computed locally in `assets/loro-core.js` with BigInt, using
exactly the contract formula and rounding (up):

```
price = floor + ceil((ceiling - floor) * (window - elapsed) / window), floor once elapsed >= window
```

`tests/auction-vectors.json` holds 160 prices computed by `LoroLoan.auctionPriceAt`
itself, including `uint256` extremes, and the test suite requires a bit for bit
match. The contract stays the authority; the page only estimates, and the buyer
always pays the price of the block that includes the transaction, which can only be
lower.

## Configuration

Everything deployment related lives in `config/loro.config.js`. Nothing else in
the codebase hardcodes an address, chain id or RPC url.

| Field | Meaning |
| --- | --- |
| `name` | network name shown in the app and footer |
| `chainId` | chain id; the app refuses to transact on any other |
| `rpcUrl` | optional public RPC for reads before a wallet connects. Never a private key or paid endpoint secret |
| `explorerUrl` | explorer base url for address and transaction links |
| `contracts.loroLoan`, `contracts.loroLens` | deployment output |
| `stablecoin.address` | optional; if set, it must equal `LoroLoan.stablecoin()` or the app stops |
| `collateral[]` | assets offered as shortcuts in the offer form; ETH is `0x0000000000000000000000000000000000000000`. Decimals and symbols are always read from chain |
| `tokenAddress` | the project token contract address, separate from LoroLoan and LoroLens. The landing page's "Contract address" bar shows it with a copy button; while `null` it reads "Coming soon". At launch this one line is the only change |
| `walletConnect.projectId` | Reown (WalletConnect) project id from https://dashboard.reown.com. Public, not a secret. Empty disables WalletConnect. Add every domain that serves the site (the Vercel domain, custom domains, `localhost`) to the project's allowlist, or wallets will refuse to connect |
| `walletConnect.metadata` | name, description and icon shown inside the wallet during connection |

A network is treated as deployed only when `chainId`, `loroLoan` and `loroLens` are
all set. Until then the landing page shows "Coming soon" and "Not deployed", and the
app shows its empty state. Never fill in an address that did not come from the
actual deployment or an official token list.

`?network=<key>` selects a network explicitly. On `localhost` the `local` profile is
the default; it can never be selected from a public host.

## Running locally against Anvil

```bash
# terminal 1
anvil

# terminal 2, in loro-contracts
forge build
A=($(cast rpc eth_accounts | tr -d '[]"' | tr ',' ' '))
LOCAL_ACTORS="${A[1]},${A[2]},${A[3]},${A[4]}" LOCAL_TREASURY="${A[9]}" \
  forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --unlocked --sender "${A[0]}" --broadcast

# terminal 2, in loro-web
node tools/sync-contracts.mjs ../loro-contracts --local
node tools/serve.mjs 5199
```

Open http://localhost:5199/app. Import one of Anvil's default development accounts
into a browser wallet, add the network `http://127.0.0.1:8545` with chain id 31337,
and the funded mock tokens (mUSD, mSTKA, mSTKB) are ready to use. Those keys are
public test keys; never use them anywhere else.

## Tests

```bash
node --test tests/loro-core.test.mjs
```

Checks the auction price against the Solidity vectors, monotonicity and bounds over
random inputs, fee rounding, time flags, strict unit parsing, and that the ABI
exposes every function the app calls with a message for every contract error.

After changing the contracts, regenerate everything the site consumes:

```bash
# in loro-contracts
forge build && forge test --match-test test_exportAuctionVectors
# in loro-web
node tools/sync-contracts.mjs ../loro-contracts
node --test tests/loro-core.test.mjs
```

## Deploying

Vercel, default settings, framework preset Other. Build command: none. Output
directory: the repository root. `.vercelignore` keeps `tools/`, `tests/` and the
generated local config out of the upload.

```bash
npx vercel deploy --prod
```

## House rules for copy

No hyphens, en dashes, or em dashes anywhere a visitor can read them. This
covers headings, body copy, button labels, tooltips, alt text, the page title,
and the meta description. Use two words ("fixed term"), one merged word
("onchain"), or a rewrite.

Dashes in code, class names, file names, and URLs are fine and often required.

## Example figures on the landing page

The phone, the step cards and the feature panels show a sample loan (#1042:
1,200.00 USDG against 1.00 ETH, 7.50% over 90 days, due 13 Nov 2026). All of it is
HTML and CSS, not screenshots, and the figures are internally consistent, so change
them together. The LoroLoan address and its explorer link in "No admin keys" are
real and come from config.

## Notes on the design

- Type is Geist for everything and Geist Mono for real values, set once as
  `--sans` and `--mono` at the top of `base.css`.
- Colours are defined once at the top of `base.css`: light surfaces, one tangerine
  accent, and status colours. The app adds none of its own.
- The sky is a CSS gradient with procedural clouds from an SVG turbulence filter,
  so there is no image to load.
- The hero objects are real 3D (three.js) with a baked studio environment for
  reflections. Without WebGL the hero still works; the canvas stays empty.
- Motion: word by word title reveals, scroll reveals, the phone rising, marquee skew
  from scroll speed, small live demos inside the cards, and a cursor that tilts cards
  and pulls buttons. The cursor only replaces the pointer on mouse and trackpad.
  Everything respects `prefers-reduced-motion`.
- `assets/favicon.svg` carries the brand colours as literal hex, because an icon
  cannot read CSS variables.
