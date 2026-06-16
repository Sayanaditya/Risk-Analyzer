# 📊 Portfolio Risk Analyzer — Monte Carlo Simulation

A minimal, high-impact portfolio risk analyzer that uses **Geometric Brownian Motion** to simulate
market scenarios and calculate **Value at Risk (VaR)** and **Expected Shortfall (CVaR)**.

Built with **FastAPI** + **NumPy** on the backend and **React** + **TailwindCSS** + **Recharts**
on the frontend.

---

## Live Website Link : https://risk-analyzer-inky.vercel.app/

## Overview

This project provides a vectorized, computationally efficient backend to simulate 10,000+
stochastic portfolio trajectories in milliseconds. By bypassing traditional iterative loops in
favor of NumPy broadcasting, it serves as a highly scalable engine for real-time risk assessment
in web environments — without the need for background task queues or external databases.

### Core Features

- **Vectorized Monte Carlo Simulation:** Executes heavy stochastic paths instantly at the C-level
  via NumPy, achieving `O(1)` Python-level overhead regardless of simulation count.
- **Advanced Risk Metrics:** Calculates parametric and historical VaR, CVaR, and exact portfolio
  percentiles from the empirical PnL distribution.
- **Trajectory Generation:** Re-simulates representative percentiles (worst-case, median,
  best-case) across fine time steps for frontend visualization.
- **Asset Contribution Analysis:** Decomposes portfolio variance to identify primary risk drivers
  using marginal volatility contributions.

---

## Mathematical Formulation

The core simulation is grounded in continuous-time stochastic calculus, modeling the price of
each asset $i \in \{1, \dots, n\}$ as a process following **Geometric Brownian Motion (GBM)**.

---

### 1. The Stochastic Differential Equation (SDE)

The dynamics of the $i$-th asset price $S_i(t)$ are governed by the Itô SDE:

$$dS_i(t) = \mu_i \, S_i(t) \, dt + \sigma_i \, S_i(t) \, dW_i(t)$$

**Parameters:**

| Symbol      | Description                                                          |
| :---------- | :------------------------------------------------------------------- |
| $S_i(t)$    | Price of asset $i$ at time $t$                                       |
| $\mu_i$     | Expected annualized return (drift coefficient)                       |
| $\sigma_i$  | Annualized volatility (diffusion coefficient)                        |
| $W_i(t)$    | Standard Wiener process; $dW_i(t) \sim \mathcal{N}(0, dt)$          |

> **Independence Assumption:** The Wiener increments $dW_i(t)$ are assumed independent across
> assets ($\text{Cov}(dW_i, dW_j) = 0$ for $i \ne j$). A correlated extension would replace the
> independent normals with a Cholesky-decomposed draw from a joint covariance matrix $\Sigma$.

---

### 2. Closed-Form Solution via Itô's Lemma

Applying **Itô's Lemma** to $f(t, S) = \ln S_i(t)$ eliminates the stochasticity in the
diffusion coefficient, transforming the SDE into a process with constant coefficients:

$$d(\ln S_i) = \left(\mu_i - \frac{1}{2}\sigma_i^2\right) dt + \sigma_i \, dW_i(t)$$

The $-\frac{1}{2}\sigma_i^2$ term is the **Itô correction** (variance drag), which arises because
$\ln$ is a concave function — Jensen's inequality implies $\mathbb{E}[\ln S] < \ln \mathbb{E}[S]$.
This ensures the simulated *median* asset path is consistent with observed market behavior rather
than the arithmetic mean path.

Integrating from $0$ to horizon $T$ yields the **exact analytical solution** for the terminal
asset value:

$$\boxed{S_i(T) = S_i(0) \exp\!\left(\underbrace{\left(\mu_i - \frac{1}{2}\sigma_i^2\right)T}_{\text{drift}} + \underbrace{\sigma_i \sqrt{T} \, Z_i}_{\text{stochastic shock}}\right)}$$

where $Z_i \sim \mathcal{N}(0, 1)$ is an i.i.d. standard normal random variable.

> **Key Property:** $S_i(T)$ is **log-normally distributed**, meaning $S_i(T) > 0$ almost surely
> — limited liability is respected by construction. Specifically:
> $$\ln S_i(T) \sim \mathcal{N}\!\left(\ln S_i(0) + \left(\mu_i - \tfrac{1}{2}\sigma_i^2\right)T,\; \sigma_i^2 T\right)$$

---

### 3. Portfolio Aggregation & Monte Carlo Approximation

Given initial total wealth $V_0$ and weight vector $\mathbf{w} = (w_1, \dots, w_n)^\top$ with
$\sum_{i=1}^n w_i = 1$, the initial capital allocated to asset $i$ is $w_i V_0$.

The **terminal portfolio value** for simulation path $j \in \{1, \dots, N\}$ is:

$$V^{(j)}(T) = \sum_{i=1}^n w_i V_0 \exp\!\left(\left(\mu_i - \frac{1}{2}\sigma_i^2\right)T + \sigma_i \sqrt{T} \, Z^{(j)}_i\right)$$

where $Z^{(j)}_i \overset{\text{i.i.d.}}{\sim} \mathcal{N}(0,1)$ is independently sampled for
each asset $i$ and path $j$.

The **Profit and Loss (PnL)** for path $j$ is defined as:

$$\Delta V^{(j)} = V^{(j)}(T) - V_0$$

By the **Law of Large Numbers**, as $N \to \infty$ the empirical distribution of
$\{\Delta V^{(j)}\}_{j=1}^N$ converges almost surely to the true distribution of portfolio
returns, making $N = 10{,}000$ a practically sufficient approximation for stable tail quantile
estimation.

---

### 4. Risk Metrics: Formal Definitions

Let $F_{\Delta V}$ denote the cumulative distribution function of the portfolio PnL, and let
$\alpha \in (0,1)$ be the chosen **confidence level** (e.g., $\alpha = 0.95$).

#### Value at Risk (VaR)

VaR at confidence level $\alpha$ is the smallest loss $\ell$ such that the probability of
exceeding $\ell$ is at most $1 - \alpha$:

$$\text{VaR}_\alpha = -\inf\!\left\{ x \in \mathbb{R} : F_{\Delta V}(x) > 1 - \alpha \right\} = -Q_{1-\alpha}(\Delta V)$$

where $Q_p(\cdot)$ denotes the $p$-th quantile. Empirically:

$$\widehat{\text{VaR}}_\alpha = -\widehat{Q}_{1-\alpha}\!\left(\{\Delta V^{(j)}\}_{j=1}^N\right)$$

**Code:**
```python
var_threshold = -float(np.percentile(pnl, 100 * (1 - confidence_level)))
```

> **Interpretation:** With 95% confidence, the portfolio will not lose more than
> $\widehat{\text{VaR}}_{0.95}$ over the horizon $T$.

#### Conditional Value at Risk (CVaR / Expected Shortfall)

CVaR, also known as **Expected Shortfall (ES)**, is the expected loss *conditional on* the loss
exceeding VaR. It captures the severity of tail events — a coherent risk measure where VaR is not:

$$\text{CVaR}_\alpha = -\mathbb{E}\!\left[\Delta V \;\middle|\; \Delta V \leq -\text{VaR}_\alpha \right] = \frac{-1}{(1-\alpha)} \int_{-\infty}^{-\text{VaR}_\alpha} x \, dF_{\Delta V}(x)$$

Empirically estimated as the arithmetic mean over the worst $(1-\alpha)$ fraction of simulated outcomes:

$$\widehat{\text{CVaR}}_\alpha = -\frac{1}{|\mathcal{T}|} \sum_{j \in \mathcal{T}} \Delta V^{(j)}, \quad \mathcal{T} = \left\{j : \Delta V^{(j)} \leq -\widehat{\text{VaR}}_\alpha\right\}$$

**Code:**
```python
tail_losses = pnl[pnl <= -var_threshold]
cvar = -float(tail_losses.mean())
```

> **Why CVaR over VaR?** VaR only tells you *that* a threshold is exceeded; CVaR tells you *by
> how much* on average. CVaR is also **subadditive** — a coherent risk measure — meaning
> $\text{CVaR}(A + B) \leq \text{CVaR}(A) + \text{CVaR}(B)$, which correctly reflects the
> benefit of diversification.

---

## Implementation & Vectorization Strategy

The defining feature of this codebase is the translation of the above mathematics into highly
optimized NumPy matrix operations. This architecture ensures **$O(1)$ Python-level execution
time** by delegating the full $O(N \times M)$ computational complexity to optimized BLAS/LAPACK
C-routines under the hood.

---

### Vectorized Path Generation

Instead of looping over thousands of simulations and assets, the entire universe of stochastic
shocks is generated in a single operation.

Let $N$ = `num_simulations` and $M$ = `n_assets`.

**Step 1 — Sample the random matrix** $\mathbf{Z} \in \mathbb{R}^{N \times M}$:

```python
Z = rng.standard_normal((n_sims, n_assets))   # shape: (N, M)
```

Each row $\mathbf{Z}^{(j)} \in \mathbb{R}^M$ is one Monte Carlo path's shock vector.

**Step 2 — Compute deterministic drift and diffusion vectors** simultaneously for all assets
using 1D broadcast arrays (shape `(M,)`):

```python
drift     = (mus - 0.5 * sigmas ** 2) * T      # shape: (M,)
diffusion = sigmas * np.sqrt(T)                 # shape: (M,)
```

**Step 3 — Apply the GBM formula** across all $N \times M$ entries in a single expression via
NumPy broadcasting (`(M,)` broadcasts over `(N, M)`):

```python
asset_terminal = (weights * V0) * np.exp(drift + diffusion * Z)
# shape: (N, M)  —  entry [j, i] = w_i * V0 * exp(drift_i + diffusion_i * Z_{j,i})
```

**Step 4 — Aggregate across the asset axis** to obtain $N$ scalar portfolio terminal values:

```python
portfolio_values = asset_terminal.sum(axis=1)   # shape: (N,)
```

The resulting PnL vector $\{\Delta V^{(j)}\}_{j=1}^N$ is then passed directly to the risk metric
estimators. The entire pipeline avoids any Python-level iteration, making it suitable for
interactive web use without dedicated compute workers.

**Complexity summary:**

| Step        | Python calls | C-level ops        |
| :---------- | :----------- | :----------------- |
| Sample $Z$  | 1            | $N \times M$       |
| Drift/diff  | 2            | $M$ each           |
| GBM exp     | 1 (broadcast)| $N \times M$       |
| Sum         | 1            | $N \times M$       |
| **Total**   | **5**        | $O(N \times M)$    |

---

## 🚀 Local Run Guide

### Step 1: Start the Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Step 2: Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

### Step 3: Open the App

Navigate to **http://localhost:5173** in your browser.  
The Vite dev server proxies all `/api` requests to the FastAPI backend at `localhost:8000`.

---

## 🏗️ Architecture

```
Risk/
├── backend/
│   ├── main.py              # FastAPI server + GBM simulation engine
│   └── requirements.txt     # Python dependencies
└── frontend/
    ├── src/
    │   ├── App.jsx          # Single-page React dashboard
    │   ├── main.jsx         # React entry point
    │   └── index.css        # TailwindCSS + custom styles
    ├── index.html           # HTML shell
    ├── package.json         # Node dependencies
    ├── vite.config.js       # Vite config with API proxy
    ├── tailwind.config.js   # Tailwind configuration
    └── postcss.config.js    # PostCSS configuration
```

---

## 📈 Features

- **Geometric Brownian Motion** simulation with fully vectorized NumPy — zero Python loops.
- **Configurable assets** — add/remove assets, adjust allocations, expected returns, and
  volatility at runtime.
- **Risk Metrics** — VaR, CVaR (Expected Shortfall), portfolio percentiles, standard deviation.
- **Interactive Charts** — empirical PnL distribution histogram + simulated path trajectories
  for worst-case, median, and best-case scenarios.
- **Premium UI** — dark theme, glassmorphism, smooth animations.
