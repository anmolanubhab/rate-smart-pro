# RD-Pro E2E tests (Playwright)

## Authentication — read this first

**No spec in this suite fills a login form, and none ever will while an AI
agent is driving it.** Entering a password into a form — whether by
clicking through a browser or by an automated script typing it — is
treated as the agent authenticating on your behalf, which isn't something
an AI assistant does here, even on request. The same boundary applies to
*creating* a QA account.

Instead, every test that needs to be signed in loads a pre-authenticated
session from `e2e/.auth/qa-user.json` (git-ignored, never committed):

```ts
test.use({ storageState: "e2e/.auth/qa-user.json" });
```

### Producing that file (do this yourself, not via an AI session)

1. Create a dedicated QA account/business in the app yourself (not against
   real customer data — see "Test data" below).
2. In your own terminal, with that account's credentials only in your
   shell's environment for that one command:
   ```bash
   E2E_QA_EMAIL=qa@example.com E2E_QA_PASSWORD=... E2E_QA_BUSINESS_NAME="Your QA Company" npx playwright test --project=setup
   ```
   `E2E_QA_BUSINESS_NAME` must exactly (case-insensitive, substring OK)
   match a company name the QA account can see on the Select Company
   screen — the setup step clicks it explicitly, it never guesses/picks
   the first company in the list. Real customer businesses must never be
   used here.
   This runs `e2e/auth.setup.ts`, which logs in once and saves the
   resulting session to `e2e/.auth/qa-user.json`.
3. From then on, `npm run test:e2e` reuses that file. Re-run step 2
   whenever the session expires.

## Test data

Every spec in this suite only ever creates/reads records it can identify
as its own (name-prefixed, e.g. `E2E_PRICING_*`) and cleans them up after
itself. Never point `E2E_BASE_URL` at a real customer's business without
also scoping test data that way.

## Running

```bash
npm run dev            # in one terminal — the app the tests drive
npm run test:e2e       # in another — runs against http://localhost:8080 by default
npm run test:e2e:ui    # interactive UI mode for debugging
```

Override the target with `E2E_BASE_URL` (e.g. to point at a preview
deployment instead of local dev).

## Specs

- `pricing-flow.spec.ts` — Pricing Test Bench → Sales Order → Edit Order →
  Invoice generation, comparing the resolved price/discount/GST/total at
  each step. See the SSOT integration notes at the top of
  `src/lib/pricing/engine.ts` for what "the same result at every step"
  is supposed to mean.
