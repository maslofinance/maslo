# MASLO CONTEXT DOCUMENT
**Version 1.1 – Developer Reference**
*Read this entire document before writing a single line of code.*

---

## 1. WHAT IS MASLO?

Maslo is a **financial behavior enforcement system** — not a budgeting app, not a tracking tool.

**The one-liner:** Maslo is the gastric bypass of financial banking apps.

Other apps are passive — they show you what you spent. Maslo is active — it controls what you can spend based on your priorities.

**Core philosophy:**
> "Most people don't fail financially due to lack of knowledge — they fail due to lack of structure."

Maslo removes decision fatigue, enforces prioritization, and guides financial behavior automatically.

---

## 2. THE VAULT SYSTEM (CORE FEATURE)

Money entering a user's account is automatically distributed into **vaults** in strict priority order. Users cannot skip or override priority vaults.

### Vault Hierarchy (Top = Highest Priority)

| Priority | Vault | Contents |
|----------|-------|----------|
| 1 | **Essentials** | Rent, groceries, insurance, utilities — CANNOT be overridden |
| 2 | **Debt** | Credit cards, loans — prioritized by highest interest rate first |
| 3 | **Future** | Savings, investing — automatically funded, restricted from impulse spending |
| 4 | **Lifestyle** | Dining out, shopping, entertainment — only accessible after priorities are covered |

### Key Principle
Money is not freely accessible — it is pre-assigned and controlled. The vault fills from top to bottom, like water filling containers in sequence.

---

## 3. THE ALLOCATION ENGINE

When income enters a connected account:
1. Maslo detects the deposit via Plaid
2. Funds are automatically distributed across vaults in priority order
3. Lifestyle vault only receives funds after all higher vaults are satisfied
4. Allocations update dynamically as spending occurs

**This logic must always run server-side. Never client-side.**

---

## 4. TRANSACTION CONTROL SYSTEM (THE MOAT)

This is what separates Maslo from every competitor.

**Other apps:** "You spent $50 on food."
**Maslo:** "This transaction is approved / warned / denied based on your vault system."

### Transaction Flow
1. User attempts a purchase
2. System identifies the spending category
3. Relevant vault is checked
4. One of three outcomes:

**✅ APPROVED** — funds available in vault, transaction aligns with category

**⚠️ WARNING** — spending exceeds safe pace
- Example message: *"You'll be out of food budget by the 25th at this rate"*

**❌ DENIED** — insufficient funds in vault or violates priority structure

### This is behavioral control, not behavioral tracking. This is Maslo's core moat.

---

## 5. THE MASLO CARD (KEY PRODUCT)

A programmable debit card tied directly to vault logic.

**Features:**
- Real-time transaction approval/denial
- Category-based restrictions
- Smart spending feedback
- Vault-based limits

**Advanced concept — "Maslo Needs Card":**
- Only works for essentials vault purchases
- Blocks lifestyle purchases entirely
- Ensures survival expenses are always covered no matter what

---

## 6. AI LAYER

The AI layer sits on top of the vault system and:
- Categorizes incoming transactions automatically
- Detects spending patterns
- Provides behavioral feedback and nudges
- Adjusts recommendations over time

**Example AI outputs:**
- *"You're overspending on dining this week"*
- *"You can increase savings by $200/month at your current pace"*

---

## 7. ONBOARDING FLOW

1. User signs up
2. Connects bank account via **Plaid**
3. Inputs financial goals OR allows Maslo to analyze spending history
4. Maslo assigns a budget style: **Liberal / Moderate / Aggressive**
5. Vaults are created and configured
6. Allocation engine activates
7. Transactions begin being monitored and controlled

---

## 8. SOCIAL & GAMIFICATION LAYER (THE MASLO EXCHANGE)

- Shared savings goals between users
- Savings competitions
- Milestone sharing
- Community financial challenges
- All social features live on **The Maslo Exchange**

---

## 9. TECH STACK

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Hosting | Vercel |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth |
| Banking Data | Plaid |
| Payments | Stripe |

### Current File Structure
```
maslo/
├── app/
│   ├── auth/page.tsx          ✅ Working auth page
│   ├── components/
│   │   └── Header.tsx         ✅ Sticky header with auth state (has minor bug — NavLink outside return)
│   ├── notes/page.tsx
│   ├── onboarding/
│   │   └── connect/page.tsx   ⚠️ Placeholder — Plaid not wired up yet
│   ├── signup/page.tsx        ✅ Working signup
│   ├── tasks/page.tsx         ✅ Full CRUD with Supabase realtime (use as pattern reference)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx               🔄 Default Next.js boilerplate — needs to be replaced with Maslo dashboard
├── lib/
│   └── supabase.ts            ✅ Clean, keys pulled from .env.local
├── .env.local                 ✅ All secrets stored here safely
```

### What's Built
- Auth system (working)
- Supabase realtime CRUD patterns (tasks page — use as reference)
- Project scaffolding and routing
- Supabase client setup

### What Needs Building
- [ ] Supabase database schema (vaults, transactions, goals, users)
- [ ] Plaid integration (bank account linking)
- [ ] Vault/allocation engine (server-side logic)
- [ ] Main Maslo dashboard (replace boilerplate home page)
- [ ] Transaction monitoring and control system
- [ ] AI categorization layer
- [ ] Maslo Exchange (social features)
- [ ] Maslo Card integration
- [ ] Stripe subscription billing

---

## 10. SECURITY RULES — NON-NEGOTIABLE

- **Never expose Plaid tokens client-side**
- **All vault logic must run server-side**
- **Transactions must be validated before approval**
- **RLS (Row Level Security) must protect all user data in Supabase**
- All API routes must verify user session before executing

---

## 11. RECOMMENDED BUILD ORDER

Build in this sequence — each step depends on the previous:

1. **Supabase Schema** — design vaults, transactions, goals, allocations tables
2. **Plaid Integration** — wire up bank account linking in /onboarding/connect
3. **Allocation Engine** — server-side vault distribution logic (Next.js API routes)
4. **Dashboard** — main Maslo UI showing vault balances and status
5. **Transaction Control** — approve/warn/deny logic
6. **AI Layer** — categorization and behavioral feedback
7. **Maslo Exchange** — social features
8. **Maslo Card** — card integration and real-time controls
9. **Stripe Billing** — subscription tiers

---

## 12. PRODUCT POSITIONING

**Maslo is NOT competing with:**
- Mint
- YNAB
- Copilot

**Maslo IS:**
- A financial fitness system
- A behavioral enforcement tool
- A structured money operating system

**The question Maslo answers:**
> "What if your money had rules you couldn't break?"

---

## 13. BUSINESS MODEL

- Monthly subscription (primary)
- Interchange fees (Maslo Card usage)
- Premium tier features
- Future: lending and financial products

---

## 14. LONG-TERM VISION

Maslo evolves into:
- Smart card ecosystem
- Automated financial coaching platform
- Credit-building system
- Multi-account control platform
- Credit optimization engine
- Debt payoff automation
- Financial scoring system

---

## 15. THE FOUNDER

**Malcolm** — Founder of Maslo Finance
- IP and copyright protections in place
- All code, logic, and concepts are proprietary to Malcolm and Maslo Finance
- Patents pending

---

## 16. SCREEN FLOW & UX SPEC

### Flow Overview
1. Splash → Sign In → Link Bank
2. Quiz → Goals → Vault Setup
3. Home Dashboard → Vault Status
4. Transaction Feed + Vaults
5. Card Logic + AI Assistant
6. Notifications + Settings

---

### Screen 1 — Splash Screen
- Dark purple aesthetic
- Animated Maslo logo
- Tagline: *"Financial fitness in your pocket"*
- Rotating micro-taglines:
  - *"Your money. Your mission. Maslo."*
  - *"Discipline, on autopilot."*

---

### Screen 2 — Sign Up / Log In
- Email sign in
- Google / Apple ID SSO
- CTA button: **"Let's Get Financially Fit"**

---

### Screen 3 — Bank Linking (Plaid)
- Plaid OAuth flow
- Link checking, savings, and credit accounts
- User confirms primary income source
- Display linked accounts with bank logos (Chase, Bluevine, etc.)

---

### Screen 4 — Budget Style Quiz
Determines user's financial personality and vault configuration style.

**Quiz questions:**
- "How often do you stress about overspending?"
- "What's more important: flexibility or saving?"

**Results:**
| Style | Vault Behavior | AI Tone |
|-------|---------------|---------|
| Liberal | Looser allocations, more lifestyle room | Financial Shaman |
| Moderate | Balanced approach | Supportive Coach |
| Aggressive | Tight allocations, max savings | Drill Sergeant |

---

### Screen 5 — Goal Setup
User inputs:
- Monthly income (manual or AI-detected from Plaid history)
- Monthly fixed expenses (rent, car, insurance, food, etc.)
- Short-term goals: *"Pay off credit card"*, *"Emergency fund"*
- Long-term goals: *"Save for surf trip"*
- Prioritization: high-interest debt first → essentials → goals

---

### Screen 6 — Vault Creation Screen
Maslo auto-generates vaults based on quiz + goals input.

**Example vaults:**
- 🏡 Rent
- 🚗 Car Payment
- 🍜 Food
- 💳 Credit Card 1 (15.9% — highest interest first)
- 🛟 Emergency Fund
- 🎉 Treat Yo Self (optional — unlocked by budget style)

**Each vault displays:**
- % funded
- Rules (locked / flexible / autopay linked)
- Color-coded urgency indicator

---

### Screen 7 — Dashboard (Home)
The main screen. The heart of Maslo.

**Displays:**
- Total Cash Balance
- Vault breakdown with % funded
- Color-coded urgency bars
- **Spend Left Today** — Maslo's dynamic spend meter

**Micro-copy examples:**
- *"Groceries vault is low. You'll be hungry by the 25th."*
- *"Treat Yo Self unlocked. Time to reward your discipline."*

---

### Screen 8 — Transaction Feed
- AI-categorized transactions assigned to vaults
- Tap any transaction to see:
  - Source account (e.g., Bluevine)
  - Maslo's decision logic (why approved/warned/denied)
  - Option to override or reclassify

---

### Screen 9 — Card Screen (Maslo Smart Debit Card)
- Current spendable balance
- Lock / unlock card toggle
- **Strict Mode** — deny any unapproved charges
- **Flexible Mode** — warn then allow
- Daily / weekly spend limit toggle

---

### Screen 10 — AI Assistant / Chat Interface
- Named: *"Ask Maslo"* or *"Chat with your Financial Coach"*

**Example queries:**
- *"Can I afford tacos tonight?"*
- *"How much is left in my emergency fund?"*
- *"When will I be debt-free?"*

---

### Screen 11 — Notification Settings
- User selects tone: Gentle nudges / Sarcastic roasts / Drill sergeant
- Daily digest: where you stand financially
- Real-time warnings when overspending or vaults are drained

---

### Screen 12 — Profile / Settings
- Change income source
- Add / remove vaults
- Change budgeting personality
- Card settings (PIN, order replacement)
- Export monthly summary reports

---

### Screen 13 — Vault Rules Editor (Advanced Users)
Per-vault rule configuration:
- % of income allocated
- Priority level
- Hard lock vs. soft lock
- Auto-pay when vault is full

---

## 17. MERCHANT NORMALIZATION ENGINE

**Purpose:** Standardize incoming transaction data from multiple banks so Maslo can accurately assign transactions to the correct vault.

**The Problem:** Transaction descriptions vary wildly across banks for the same merchant. Without normalization, vault logic cannot reliably categorize or enforce spending controls.

### Input Sources
- Raw transaction string (from Plaid or direct bank API)
- Merchant Category Code (MCC) if available
- Plaid's standardized merchant name if available
- User-defined merchant rules / overrides

### Normalization Steps

**Step 1 — Clean Raw Description**
- Strip prefixes: "POS", "PURCHASE AUTH", "DEBIT"
- Normalize spacing, symbols, casing
- Example: `CHIPOTLE #1983 NJ` → `Chipotle 1983 NJ`
- Use regex pattern matching to isolate core merchant name

**Step 2 — Fuzzy Match to Known Merchant Table**
- Compare cleaned name to internal known merchants list
- Use fuzzy logic (Levenshtein distance or trigram similarity)
- If confidence score > threshold → assign known merchant ID

**Step 3 — Attach Metadata**
- Assign default category (Dining, Gas, Utilities, etc.)
- Assign MCC if available
- Store merchant ID and category in transaction log

**Step 4 — Check User Overrides**
- If user has set a preferred category/vault for this merchant, apply it
- Store override for future transactions from same merchant

### Example
```
Raw Input:   PURCHASE AUTH STARBUCKS STORE #0417 NYC
Cleaned:     Starbucks 0417 NYC
Fuzzy Match: Starbucks
Category:    Dining
MCC:         5814
Vault:       Wants (unless user override)
```

### Output Schema
```json
{
  "merchant_id": "starbucks",
  "display_name": "Starbucks",
  "category": "Dining",
  "mcc": "5814",
  "user_override": false,
  "vault_assignment": "Wants"
}
```

### Edge Cases
- **Unknown merchant** → fallback to MCC-based categorization or string heuristics
- **Multiple fuzzy matches** → prompt user to confirm, train AI for future
- **Manual correction** → any manual assignment updates the merchant table permanently

### Dev Requirements
- Fuzzy matching algorithm (or leverage Plaid's normalized name field first)
- Persistent merchant lookup table in Supabase with override capability
- Input/output schema for transaction parser
- Hook for user-defined rules per merchant

**⚠️ This system is the foundation for all vault logic. Transactions must be normalized and categorized before any vault impact, blocking behavior, or budget alerts can fire.**

---

## 18. INTERNAL VAULT LOGIC

### The Personal Trainer Mental Model
Maslo is a financial personal trainer that lives in your wallet. A personal trainer doesn't ask you every morning "do you want to work out today?" — the plan is already set. They just execute it. Maslo is the same. The plan is set at onboarding. Income arrives, Maslo executes.

**The Hero Line (use this everywhere — marketing, App Store, pitch deck):**
> "Even a personal trainer can't knock the Oreos out of your hand at 2am — but Maslo can block that impulse Amazon purchase when your rent vault isn't full."

---

### Income Distribution Logic

When a paycheck or deposit lands:
1. Plaid detects deposit instantly
2. Maslo **automatically distributes** funds into vaults based on user's preset rules — no confirmation needed
3. Simultaneously triggers a **real-time animation** — user watches money flow into each vault live
4. Maslo already knows the plan from onboarding — it just executes it

---

### Onboarding Intelligence (What Maslo Collects at Setup)
- All fixed bills + their **exact due dates** (rent on 1st, car on 15th, utilities on 22nd)
- All debts + interest rates
- Income amount + frequency (weekly / biweekly / monthly)
- Aggression level per category (liberal / moderate / aggressive)
- Short and long term goals

This means Maslo isn't just reacting to money — it's **anticipating** it. It knows rent is due in 8 days and the paycheck arrives in 5. It warns the user before anything is ever late.

---

### Credit Card Payment Logic
- Maslo tracks the **original purchases** in real time (e.g., groceries → Essentials vault)
- The credit card payment itself is treated as a **Debt vault transaction**
- Debt balance pulled live from Plaid when available
- Manual balance input as fallback
- In-app **Pay Button** inside each debt vault:
  - **Free tier** → Maslo deep-links to bank app with amount pre-filled
  - **Premium tier** → Maslo executes payment fully in-app
  - Both tiers show a real-time animation of cash flowing out and debt bar shrinking

---

### Venmo / P2P Transaction Logic
- P2P apps (Venmo, Cash App, Zelle) are **never directly linked**
- Plaid simply sees money moving in or out
- **First time Maslo sees a P2P transaction** → prompts user to categorize it
- **Over time** → Maslo learns patterns and auto-categorizes
- **User can set standing rules upfront:**
  - *"All Venmo outgoing = Lifestyle vault"*
  - *"All Venmo incoming = Income"*
- No P2P API complexity, no licensing headaches — Plaid sees the money move, Maslo learns once, applies forever

---

### Internal Transfer Logic (Checking → Savings)
- Internal transfers between user's own accounts are **ignored as transactions**
- Instead Maslo watches the **savings account balance** via Plaid
- Balance goes up → Future vault reflects the increase
- Balance goes down → Future vault reflects the decrease
- No need to track the transfer — just track the outcome
- In-app seamless transfer button = **Phase 2 premium feature** (requires licensing)

---

### Predictive Vault Management (Phase 2)
Because Maslo knows bill due dates + income schedule it can:
- Warn user before a vault runs low ahead of a due date
- Flag: *"Rent is due in 8 days. Your paycheck arrives in 5. You're covered."*
- Flag: *"Car payment due in 3 days. Current vault balance is $180 short."*
- Block discretionary spending when a critical vault is underfunded
- This is the 2am Amazon block — impulse purchase attempted, rent vault not full, **transaction denied**

---

### Logic Decision Summary

| Scenario | Maslo Behavior |
|----------|---------------|
| Paycheck arrives | Auto-distribute into vaults + animate in real time |
| Credit card purchases | Track individually, assign to correct vault |
| Credit card payment | Treat as Debt vault transaction, animate paydown |
| Venmo / P2P out | Flag → categorize once → learn pattern |
| Venmo / P2P in | Flag → categorize once → learn pattern |
| Internal bank transfer | Ignore transfer, track balance change outcome |
| Impulse purchase, vault underfunded | Block transaction, notify user |
| Bill due date approaching, vault short | Predictive warning triggered |

---

## 19. MASLO CARD STRATEGY & COMPLIANCE MODEL

### The Starbucks Model
Maslo doesn't need a banking license to issue cards. Starbucks isn't a bank. Apple isn't a bank. Amazon isn't a bank. They all issue cards through a **Banking-as-a-Service (BaaS) partner** — a licensed bank sits behind the scenes handling compliance and FDIC insurance while the brand controls the entire user experience and spending logic.

This is Maslo's card model.

### Current Stage — Friction Model (Not Blocking)
Maslo is not a bank yet. Hard transaction blocking requires a banking license. At this stage Maslo uses a **friction model:**
- Plaid detects a transaction
- Maslo checks vault status instantly
- If vault is underfunded → push notification fires immediately
- Notification tone matches user's personality setting (Drill Sergeant, Financial Shaman, etc.)
- Example: *"$47 on Amazon at 2am — your rent vault is $200 short. You sure about this?"*
- User makes the conscious choice — Maslo holds up the mirror
- This is psychologically powerful — user feels empowered not controlled

### Phase 1 — Stripe Issuing (Already in Stack)
Maslo already has Stripe in its tech stack. **Stripe Issuing** allows Maslo to create and control physical and virtual debit cards with:
- Real-time transaction authorization
- Merchant category blocking
- Vault-based spending rules
- No banking license required — Stripe handles compliance

**This means the 2am Amazon block can happen in Phase 1 — not Phase 2.**

### BaaS Partner Options
| Provider | Notes |
|----------|-------|
| **Stripe Issuing** | Already in Maslo's stack — fastest path |
| **Lithic** | Built specifically for programmable card logic |
| **Marqeta** | Powers Cash App, Affirm, DoorDash cards |

### Card Evolution Roadmap
- **Phase 1** — Virtual Maslo Card via Stripe Issuing, vault-based rules, real-time blocking
- **Phase 2** — Physical Maslo Card with Strict/Flexible mode toggle
- **Phase 3** — Full Maslo Card ecosystem with credit building, rewards tied to vault discipline

---

## 20. COMPETITIVE LANDSCAPE

### The Market Gap
The technology for spending controls, vault logic, and card blocking already exists. Nobody has built it for the average American who just wants to get their financial life together.

### Current Players

| Company | What They Do | Who It's For | Why It's Not Maslo |
|---------|-------------|--------------|-------------------|
| **YNAB** | Zero-based budgeting, assign every dollar | Adults who want to plan | Passive — tracks, doesn't enforce |
| **Mint / Rocket Money** | Spending tracking, bill management | General consumers | Passive — shows you what happened |
| **Monarch** | Net worth tracking, budgeting dashboard | Couples, planners | Passive — no enforcement |
| **Greenlight** | Category blocking, spending controls, real-time alerts | Parents controlling kids' money | Wrong audience |
| **Ramp** | Merchant-level blocking, category controls, vault-style budgets | Corporations and businesses | Wrong audience |
| **True Link** | Prepaid card with spending controls and category blocking | Elderly adults managed by caregivers | Wrong audience |

### The Whitespace
Every tool that has real enforcement capability is built for the wrong audience:
- Greenlight = kids
- Ramp = corporations
- True Link = elderly

**Nobody has built active financial enforcement for the average American adult.**

### Maslo's Pitch
> *"Greenlight built this for kids. Ramp built this for corporations. We built it for the 60% of Americans living paycheck to paycheck."*

### Maslo's Competitive Moat
- Not competing on features — competing on **behavioral enforcement**
- The vault system + card blocking combination doesn't exist for consumers
- First mover advantage in active financial discipline for everyday Americans
- Network effects through the Maslo Exchange (social goals, competitions)

---

*This document should be updated as the product evolves. When starting a new Claude Code session, paste this document and say: "Read this context document before we begin."*
