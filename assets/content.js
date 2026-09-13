/* ============================================================
   LORO — site copy for the list rendered sections.

   Prose that appears once lives directly in index.html.
   This file holds only the repeating lists, which the
   renderers in landing.js turn into markup.
   ============================================================ */

window.LoroContent = {
  global: {
    // Ticker between the light section and How it works.
    // Entries without a logo render as a serif wordmark.
    ticker: [
      { name: "Fixed rate" },
      { name: "Fixed term" },
      { name: "Overcollateralized" },
      { name: "Permissionless" },
      { name: "No oracle" },
      { name: "No KYC" },
      { name: "No admin keys" },
      { name: "Nothing upgradeable" }
    ]
  },

  problem: {
    sellMeta: ["Position closed", "Upside gone"],
    offchainMeta: ["Paperwork", "Identity checks", "A middleman"]
  },

  home: {
    /* Metric numbers in the light section.
       Shape: { prefix, value, suffix, label }. A numeric value above
       zero counts up on scroll; anything else renders as written.
       These four are structural facts of the protocol, so they stay
       at zero. Real figures can replace them here, and nowhere else. */
    metrics: [
      { prefix: "", value: 0, suffix: "", label: "Price oracles" },
      { prefix: "", value: 0, suffix: "", label: "Admin keys" },
      { prefix: "", value: 0, suffix: "", label: "KYC forms" },
      { prefix: "", value: 0, suffix: "", label: "Upgrade paths" }
    ],

    steps: [
      {
        icon: "lock",
        title: "Lock",
        copy: "Lock your Stock Token or ETH as collateral."
      },
      {
        icon: "note",
        title: "Borrow",
        copy: "Borrow stablecoin at a rate fixed from day one."
      },
      {
        icon: "clock",
        title: "Settle",
        copy: "Repay by the deadline, or the collateral is auctioned."
      }
    ],

    why: [
      {
        icon: "person",
        title: "No underwriter",
        copy: "No one judges you before you borrow."
      },
      {
        icon: "signal",
        title: "No oracle",
        copy: "There is no price feed to manipulate."
      },
      {
        icon: "key",
        title: "No admin key",
        copy: "Nobody can change the rules after you borrow."
      }
    ]
  }
};
