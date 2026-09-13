/* ============================================================
   LORO — protocol core
   Pure math, units and state helpers. No DOM, no wallet, no
   library. Everything here mirrors LoroLoan.sol exactly, and
   tests/loro-core.test.mjs checks the auction price against
   values computed by the Solidity contract itself.

   All amounts and timestamps are BigInt.
   ============================================================ */

export const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";
export const BPS = 10000n;

export const Status = Object.freeze({
  None: 0,
  Offered: 1,
  Cancelled: 2,
  Active: 3,
  Repaid: 4,
  AuctionOpen: 5,
  Settled: 6,
  ClaimedByLender: 7
});

const STATUS_LABELS = [
  "Unknown",
  "Open offer",
  "Cancelled",
  "Active",
  "Repaid",
  "Auction open",
  "Settled by auction",
  "Collateral claimed"
];

export function statusLabel(status) {
  return STATUS_LABELS[Number(status)] || "Unknown";
}

/* ------------------------------------------------------------
   Dutch auction price. Identical to LoroLoan.auctionPriceAt:

     elapsed = max(0, timestamp - start)
     price   = floor                                        if elapsed >= window
     price   = floor + ceil((ceiling - floor) * (window - elapsed) / window)

   BigInt has no overflow, so the plain ceiling division below is
   exactly Math.mulDiv(..., Rounding.Ceil).
   ------------------------------------------------------------ */
export function auctionPriceAt(floor, ceiling, start, window, timestamp) {
  if (window === 0n) throw new Error("InvalidAuctionWindow");
  if (ceiling < floor) throw new Error("CeilingBelowDebt");
  const elapsed = timestamp > start ? timestamp - start : 0n;
  if (elapsed >= window) return floor;
  const numerator = (ceiling - floor) * (window - elapsed);
  return floor + (numerator + window - 1n) / window;
}

/* Protocol fee on interest. Rounds down, like LoroLoan.feeOn. */
export function feeOn(interest, feeBps) {
  return (interest * BigInt(feeBps)) / BPS;
}

/* Derived flags, the same rules LoroLens applies at block time.
   `loan` uses the field names of the LoroLoan.Loan struct. */
export function deriveFlags(loan, now) {
  const status = Number(loan.status);
  const maturity = BigInt(loan.maturity);
  const auctionEnd = BigInt(loan.auctionStart) + BigInt(loan.auctionWindow);
  const flags = {
    repayable: false,
    auctionOpenable: false,
    fillable: false,
    claimable: false,
    proceedsWithdrawable: false,
    auctionEnd: status === Status.AuctionOpen ? auctionEnd : 0n
  };
  if (status === Status.Active) {
    flags.repayable = now <= maturity;
    flags.auctionOpenable = !flags.repayable;
  } else if (status === Status.AuctionOpen) {
    flags.fillable = now <= auctionEnd;
    flags.claimable = !flags.fillable;
  } else if (status === Status.Repaid || status === Status.Settled) {
    flags.proceedsWithdrawable = !loan.proceedsWithdrawn;
  }
  return flags;
}

/* ------------------------------------------------------------
   Units
   ------------------------------------------------------------ */

/* Strict decimal parser. Accepts "1234", "1,234.5", ".5".
   Rejects signs, exponents, and more fractional digits than the
   token supports, rather than silently rounding user input. */
export function parseUnits(text, decimals) {
  const clean = String(text == null ? "" : text).trim().replace(/,/g, "");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(clean)) throw new Error("Enter a number.");
  const [whole, frac = ""] = clean.split(".");
  if (frac.length > decimals) {
    throw new Error("Use at most " + decimals + " decimal places.");
  }
  return BigInt((whole || "0") + frac.padEnd(decimals, "0"));
}

export function formatUnits(value, decimals, maxFraction) {
  const v = BigInt(value);
  const d = BigInt(decimals);
  const base = 10n ** d;
  const whole = v / base;
  let frac = (v % base).toString().padStart(Number(d), "0");
  const keep = maxFraction == null ? Number(d) : Math.min(maxFraction, Number(d));
  frac = frac.slice(0, keep).replace(/0+$/, "");
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? wholeText + "." + frac : wholeText;
}

/* Informational only: the simple annualised rate implied by a fixed
   interest amount over a fixed term. The contract never uses it. */
export function impliedAprPercent(principal, interest, durationSeconds) {
  if (principal === 0n || durationSeconds === 0n) return "0.00";
  const year = 365n * 24n * 3600n;
  const bps = (interest * BPS * year) / (principal * durationSeconds);
  const whole = bps / 100n;
  const cents = (bps % 100n).toString().padStart(2, "0");
  return whole.toString() + "." + cents;
}

export function formatDuration(seconds) {
  const s = Number(seconds);
  if (s % 86400 === 0) return s / 86400 + (s === 86400 ? " day" : " days");
  if (s % 3600 === 0) return s / 3600 + (s === 3600 ? " hour" : " hours");
  if (s % 60 === 0) return s / 60 + " min";
  return s + " sec";
}

export function formatCountdown(seconds) {
  let s = Number(seconds);
  if (s <= 0) return "now";
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d > 0) return d + "d " + h + "h";
  if (h > 0) return h + "h " + m + "m";
  if (m > 0) return m + "m " + s + "s";
  return s + "s";
}

export function formatDate(timestamp) {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

export function shortAddress(addr) {
  if (!addr) return "";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

/* ------------------------------------------------------------
   Contract errors, in plain language. Keys are the custom error
   names declared in LoroLoan.sol and OpenZeppelin.
   ------------------------------------------------------------ */
const ERRORS = {
  InvalidConfig: "This LoroLoan deployment was configured incorrectly.",
  ZeroAmount: "Amounts must be above zero.",
  InvalidDuration: "The loan term must be between one second and ten years.",
  InvalidAuctionWindow: "The auction window must be between one second and one year.",
  CeilingBelowDebt: "The auction ceiling must be at least principal plus interest.",
  InvalidCollateralAsset: "That collateral asset is not accepted. It cannot be the stablecoin or an address without code.",
  InvalidStatus: "This loan is no longer in a state that allows that action. Refresh to see its latest state.",
  NotLender: "Only the lender of this loan can do that.",
  NotBorrower: "Only the borrower of this loan can repay it.",
  SelfBorrow: "You cannot accept your own offer.",
  IncorrectEthAmount: "The ETH sent does not match the required collateral exactly.",
  LoanMatured: "The repayment deadline has passed. This loan can no longer be repaid.",
  LoanNotMatured: "The loan has not passed its deadline yet.",
  AuctionExpired: "The auction window has closed. Only the lender can claim the collateral now.",
  AuctionNotExpired: "The auction is still running. The lender can claim once it closes unfilled.",
  AlreadyWithdrawn: "These proceeds were already withdrawn.",
  NothingToSweep: "There are no fees to send to the treasury.",
  UnsupportedTokenBehavior: "The token moved a different amount than requested. Loro does not support fee on transfer or rebasing tokens.",
  EthTransferFailed: "The ETH transfer to your address failed.",
  ReentrancyGuardReentrantCall: "A token tried to call back into Loro during a transfer. The transaction was stopped.",
  ERC20InsufficientBalance: "Your token balance is too low for this transaction.",
  ERC20InsufficientAllowance: "Loro is not approved to move enough of this token.",
  SafeERC20FailedOperation: "The token transfer failed."
};

export function describeContractError(name) {
  return ERRORS[name] || null;
}
