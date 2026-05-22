# ADR 001 — Brokerage buys recorded as account outflows, not expenses

## Status

Accepted

## Context

When a user buys a stock (or other market asset), cash leaves a brokerage
account and becomes a security holding. This is an asset conversion, not a
spending event. The question is: how should this be represented in the
transaction and reconciliation model?

## Decision

Brokerage buy operations are recorded as **outflow adjustments** on the
brokerage cash account, not as expense transactions. The counterpart — the
increase in the security's value — is reflected by updating the asset's
`quantity` and `unitPrice` directly.

## Consequences

### Expected reconciliation mismatch after a buy

After recording a buy, the account reconciliation will show a mismatch:

- `trackedBalance` increases (the security's market value has grown)
- `expectedBalance` decreases (cash left the account)

This mismatch is **by design and expected**. It resolves only when the user
manually updates the stock asset's `quantity` and `unitPrice` to reflect the
new holding. Once updated, `trackedBalance` rises to match the new cost basis
and the mismatch disappears.

This is a known UX gap — the mismatch period between a buy being recorded and
the asset being updated can look like a data error but is not one.

### Why not treat it as an expense?

A stock purchase is not a spending event — it is wealth reclassification from
liquid cash to an illiquid asset. Treating it as an expense would distort
cash-flow reporting and budget categories. The outflow approach correctly
removes the cash from the account without attributing it to spending.

### Future consideration

A tighter flow (creating the asset position atomically with the buy, zeroing
the mismatch immediately) is possible but was deferred. The current flow
prioritises simplicity: the brokerage buy records the transaction; the user
updates the asset position separately using the edit modal.
