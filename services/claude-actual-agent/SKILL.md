---
name: actual-budget
description: Answer questions about the user's Actual Budget data, and add/edit/delete transactions on request — accounts, balances, spending by category, net worth, and the off-budget Splitwise debt tracker — by querying the self-hosted Actual server directly. Use whenever the user asks about their budget, spending, balances, net worth, Splitwise/debt, or wants to log an expense.
---

# Actual Budget Q&A + Expense Logging (phone/Remote Control instance)

This is the always-on NAS instance of the actual-budget skill, reached via Claude
Code Remote Control from a phone. It talks to the same self-hosted Actual
server (`actualbudget/actual-server`) over the internal Docker network — no LAN/VPN
dependency, since this container runs on the same NAS.

Amounts everywhere in the API are **integer cents**
(e.g. `4250` = $42.50). For on-budget accounts, outflows (expenses) are **negative**
amounts and inflows are positive — confirm the sign makes sense for what the user
describes before writing.

## Running commands

Run from the current working directory (`/home/node/actual-budget`), using Node's
built-in env-file loader — `.env` is already present there:

```
node --env-file=.env cli.mjs <command>
```

Built-in commands:
- `accounts` — all accounts as JSON (`id`, `name`, `offbudget`, `closed`, ...)
- `categories` — category groups with nested categories as JSON
- `payees` — all payees as JSON
- `eval "<js body>"` — run arbitrary code with `api`, `q`, `runQuery` in scope,
  must end with an explicit `return`. For anything longer than a one-liner,
  write it to a scratch `.js` file and pass `eval @path/to/file.js` instead.

Every command downloads a fresh copy of the budget from the server first.

## Key data model notes

- **Off-budget accounts** (e.g. Splitwise) have `offbudget: true`. Tracking-only —
  include for net worth, exclude from spending/income analysis unless asked.
- **Transfers** show up as transactions with a non-null `transfer_id` — exclude
  when summing spending by category.
- A transaction's `category` and `payee` fields are *ids* — resolve to names via
  `getCategoryGroups()` / `getPayees()` when presenting to the user.

## Adding an expense (the main reason this instance exists)

This is a normal, expected request here — this instance exists specifically to log
expenses from a phone. Still, always:

1. **Resolve the account** — ask which account if it's not obvious (e.g. "which
   card/account was this on?"). Match against `api.getAccounts()`; don't guess
   between similarly-named accounts.
2. **Resolve or confirm the category** — match against `getCategoryGroups()`.
   If nothing fits well, ask rather than picking arbitrarily.
3. **Confirm the amount and sign** — restate it back ("$42.50 out of Checking,
   is that right?") before writing anything.
4. **Date** — default to today unless the user says otherwise.
5. Use `eval` to call `api.addTransactions(accountId, [{ date, amount, payee_name, category, notes }])`
   — `payee_name` as a plain string is fine, Actual matches/creates the payee.
   Amount is negative cents for an expense on an on-budget account.
6. After writing, read back the created transaction (or re-fetch accounts) and
   tell the user it's done with the specifics, so they can catch a mistake immediately.

Splitwise settle-ups: these post to the off-budget Splitwise account — confirm
that's actually the intended account before writing, since it changes debt
tracking rather than a budget category.

## Safety

Never call `addTransactions`, `importTransactions`, `updateTransaction`, or
`deleteTransaction` without restating the full details (account, amount, date,
payee, category) and getting an explicit go-ahead in the same conversation —
even though write access is the point of this instance, each individual write
still needs confirmation. Never guess an account or category when more than one
plausible match exists — ask.
