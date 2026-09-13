// Run with: node --test tests/
// No dependencies. Checks the browser math against the Solidity contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  auctionPriceAt, feeOn, deriveFlags, parseUnits, formatUnits,
  impliedAprPercent, Status, describeContractError
} from "../assets/loro-core.js";
import { LORO_LOAN_ABI, LORO_LENS_ABI } from "../assets/loro-abi.js";

const vectors = JSON.parse(
  readFileSync(new URL("./auction-vectors.json", import.meta.url), "utf8")
);

test("auction price matches every Solidity computed vector", () => {
  assert.ok(vectors.length >= 100, "vector file looks truncated");
  for (const v of vectors) {
    const got = auctionPriceAt(
      BigInt(v.floor), BigInt(v.ceiling), BigInt(v.start), BigInt(v.window), BigInt(v.timestamp)
    );
    assert.equal(got.toString(), v.price, JSON.stringify(v));
  }
});

test("auction price boundaries", () => {
  const f = 1050n, c = 2000n, s = 1000n, w = 100n;
  assert.equal(auctionPriceAt(f, c, s, w, s), c);
  assert.equal(auctionPriceAt(f, c, s, w, s + 1n), 1050n + 941n); // 940.5 rounds up
  assert.equal(auctionPriceAt(f, c, s, w, s + 50n), 1525n);
  assert.equal(auctionPriceAt(f, c, s, w, s + 99n), 1060n); // 9.5 rounds up
  assert.equal(auctionPriceAt(f, c, s, w, s + 100n), f);
  assert.equal(auctionPriceAt(f, c, s, w, s + 1000n), f);
  assert.equal(auctionPriceAt(500n, 500n, 0n, 10n, 3n), 500n);
  assert.throws(() => auctionPriceAt(1n, 2n, 0n, 0n, 0n), /InvalidAuctionWindow/);
  assert.throws(() => auctionPriceAt(2n, 1n, 0n, 1n, 0n), /CeilingBelowDebt/);
});

test("auction price is monotonic, bounded, never below the linear price", () => {
  let seed = 7n;
  const rand = (bits) => {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return (seed * seed) % (1n << BigInt(bits));
  };
  for (let i = 0; i < 3000; i++) {
    const floor = rand(1 + (i % 200));
    const ceiling = floor + rand(1 + ((i * 7) % 200));
    const window = 1n + rand(25);
    const e1 = rand(26) % (window * 2n);
    const e2 = e1 + (rand(26) % window);
    const p1 = auctionPriceAt(floor, ceiling, 0n, window, e1);
    const p2 = auctionPriceAt(floor, ceiling, 0n, window, e2);
    assert.ok(p1 >= p2 && p2 >= floor && p1 <= ceiling);
    if (e1 < window) {
      const x = p1 - floor;
      const exact = (ceiling - floor) * (window - e1);
      assert.ok(x * window >= exact);
      if (x > 0n) assert.ok((x - 1n) * window < exact);
    }
  }
});

test("fee rounds down and never exceeds interest", () => {
  assert.equal(feeOn(50000000n, 1000), 5000000n);
  assert.equal(feeOn(9n, 1000), 0n);
  assert.equal(feeOn(19n, 1000), 1n);
  assert.equal(feeOn(123n, 10000), 123n);
  assert.equal(feeOn(123n, 0), 0n);
});

test("derived flags use the contract's timestamp rules", () => {
  const active = { status: Status.Active, maturity: 100n, auctionStart: 0n, auctionWindow: 10n };
  assert.equal(deriveFlags(active, 100n).repayable, true);
  assert.equal(deriveFlags(active, 101n).auctionOpenable, true);
  const auction = { status: Status.AuctionOpen, maturity: 100n, auctionStart: 200n, auctionWindow: 10n };
  assert.equal(deriveFlags(auction, 210n).fillable, true);
  assert.equal(deriveFlags(auction, 210n).claimable, false);
  assert.equal(deriveFlags(auction, 211n).claimable, true);
  const repaid = { status: Status.Repaid, maturity: 1n, auctionStart: 0n, auctionWindow: 1n, proceedsWithdrawn: false };
  assert.equal(deriveFlags(repaid, 0n).proceedsWithdrawable, true);
});

test("units parse strictly and format with grouping", () => {
  assert.equal(parseUnits("1,000.5", 6), 1000500000n);
  assert.equal(parseUnits(".25", 18), 250000000000000000n);
  assert.equal(parseUnits("7", 0), 7n);
  for (const bad of ["", "-1", "1e5", "1.2.3", "abc", " "]) {
    assert.throws(() => parseUnits(bad, 6), bad);
  }
  assert.throws(() => parseUnits("1.0000001", 6), /decimal places/);
  assert.equal(formatUnits(1234567890n, 6), "1,234.56789");
  assert.equal(formatUnits(1000000n, 6), "1");
  assert.equal(formatUnits(123456789n, 6, 2), "123.45");
});

test("implied APR is informational and exact", () => {
  // 50 on 1000 over 30 days = 60.83% APR
  assert.equal(impliedAprPercent(1000n, 50n, 30n * 86400n), "60.83");
});

test("ABI exposes every function the app calls", () => {
  const names = (abi) => new Set(abi.filter((x) => x.type === "function").map((x) => x.name));
  const loan = names(LORO_LOAN_ABI);
  for (const fn of [
    "createOffer", "cancelOffer", "acceptOffer", "repay", "openAuction", "fillAuction",
    "claimCollateral", "withdrawProceeds", "sweepFees", "getLoan", "auctionPriceAt",
    "currentAuctionPrice", "feeOn", "stablecoin", "treasury", "feeBps", "loanCount"
  ]) assert.ok(loan.has(fn), fn);
  const accept = LORO_LOAN_ABI.find((x) => x.name === "acceptOffer");
  assert.equal(accept.stateMutability, "payable");
  const lens = names(LORO_LENS_ABI);
  for (const fn of ["query", "getLoanView", "getLoanViews", "config"]) assert.ok(lens.has(fn), fn);
  for (const e of LORO_LOAN_ABI.filter((x) => x.type === "error")) {
    assert.ok(describeContractError(e.name), "no message for error " + e.name);
  }
});
