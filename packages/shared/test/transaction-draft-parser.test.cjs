const assert = require("node:assert/strict");
const test = require("node:test");

const { createHeuristicTransactionDraft } = require(
  "../src/transaction-draft-parser.cjs",
);

test("creates a reviewable expense draft from redacted text", () => {
  const draft = createHeuristicTransactionDraft(
    "Paid €42.50 at the supermarket by card",
  );

  assert.deepEqual(
    {
      kind: draft.kind,
      amount: draft.amount,
      currency: draft.currency,
      postedAt: draft.postedAt,
      paymentMethod: draft.paymentMethod,
    },
    {
      kind: "EXPENSE",
      amount: 42.5,
      currency: "EUR",
      postedAt: null,
      paymentMethod: "card",
    },
  );
});

test("does not infer sensitive card digits from unrelated numbers", () => {
  const draft = createHeuristicTransactionDraft("Coffee €4.20, order 1234");

  assert.equal(draft.cardLast4, null);
  assert.equal(draft.amount, 4.2);
});
