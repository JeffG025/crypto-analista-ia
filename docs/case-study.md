# Case study — The AI product that told the truth about itself

**CryptoMind** · AI-assisted market analysis, web app + Telegram bot
**Role:** sole developer — product, backend, frontend, data analysis
**Stack:** Node.js · React · PostgreSQL (Supabase) · Groq / Llama 3.3 · Stripe · Telegram
**Live:** [crypto-analista-ia.vercel.app](https://crypto-analista-ia.vercel.app) · [public transparency report](https://crypto-analista-ia.vercel.app/transparencia) · [source code](https://github.com/JeffG025/crypto-analista-ia)

*Versión en español: [caso-de-estudio.md](caso-de-estudio.md)*

---

## The short version

I built an AI tool that predicted whether a cryptocurrency would go up or down, and showed a "reliability" percentage next to each call. Before selling it further, I tested it against five years of real market data. **It didn't work** — its calls were right less often than the market itself.

Instead of hiding that, I found the part of the problem that *can* be predicted, rebuilt the product around it, and verified the new forecast on data it had never seen: **it is right 82.9% of the time when it says it will be right 80% of the time.**

The lesson I take into every client project: **measure before you claim.**

---

## The problem

The product made two promises it couldn't back up:

- **"This coin will go up."** The app gave a buy or sell signal based on standard technical indicators.
- **"Reliability: 72%."** That number came from a formula applied to the signal itself. It sounded like a success rate, but it had never been checked against what actually happened.

The goal was 80% accuracy, and an early streak of 8 correct calls out of 10 made it look within reach.

## What I did

### 1. Tested the product that was actually live

I replayed the exact same logic over five years of daily prices for the 10 coins the app tracks — 16,250 historical decisions — using only the information that would have been available on each day. Then I compared every call with what happened next, and with what the market did on its own.

| Signal | Right | Market alone |
|---|---|---|
| Strong buy | 44.5% | 47.2% |
| Buy | 45.6% | 47.2% |

The strongest "buy" calls were the worst ones. And the 8-out-of-10 streak? With dozens of calls a day, a streak like that shows up **several times a month by pure chance**, even when a signal is useless.

### 2. Changed the question

Whether a price goes up or down is close to a coin flip. *How much* it moves is not: calm weeks tend to follow calm weeks, volatile weeks follow volatile weeks. So the app stopped promising a direction and started giving a range:

> *Bitcoin will trade between $61,769 and $67,056 over the next 7 days — 80% confidence.*

I calibrated those ranges on the older 70% of the data and tested them on the most recent 30%, which they had never seen:

| Confidence promised | Crypto, actual | Stocks, actual |
|---|---|---|
| 50% | 51.6% | 52.0% |
| **80%** | **82.9%** | **80.8%** |
| 95% | 96.4% | 93.4% |

### 3. Put a reference point next to every number

A percentage on its own misleads. In stocks, the strongest buy signals were right 57% of the time — impressive, until you see the stocks rose 56.3% of the time anyway. So every success rate in the app is now shown next to what the market did by itself, and the label ("measured edge", "no demonstrable edge", "worse than the market") follows a fixed rule instead of my judgement.

That rule applies to good news too. When the live record showed a flattering **59%**, I added the market's **48%** beside it, along with a note on why the sample is smaller than it looks.

### 4. Shipped it end to end

New analysis screen, updated Telegram bot, a public transparency page, and an engine that now works for stocks as well as crypto. All of it was deployed, verified on the live site, and documented so anyone can reproduce the numbers.

## Results

- A **verified 80% forecast**, measured on data the model never saw
- **No invented numbers** left in the product — every percentage has its baseline and sample size next to it
- **A public audit** of the original signal, failures included
- A **multi-asset engine**: adding stocks took a new data source, not a rewrite

## What this means if you hire me

Most AI projects fail quietly: a chatbot that answers confidently and wrongly, a dashboard with a number nobody has checked. The way I work prevents that:

- **I test before I promise.** If something can't do what you need, you hear it from me before you pay for it.
- **I look for what actually works.** Here the honest answer wasn't "it's impossible" — it was a different, useful question the data *could* answer.
- **I make results checkable.** You get the numbers, how they were measured, and how to check them again.

---

*Technical details — calibration method, architecture, how to reproduce every number — are in the [README](../README.md).*
