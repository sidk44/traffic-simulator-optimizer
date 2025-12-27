# 🚦 Adaptive Traffic Control System

An adaptive traffic signal optimization platform for multi-intersection traffic management. Built with Next.js 14, TypeScript, and Server-Sent Events (SSE), this system enables real-time monitoring of traffic metrics, automated signal optimization via AFAPC algorithms, and scenario-based simulation for testing adaptive control strategies.


---

## 🚀 Getting Started

### **Prerequisites**

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Git**: For cloning the repository

### **Installation & Setup**

1. **Clone the repository:**

   ```bash
   git clone https://github.com/sidk44/traffic-simulator-optimizer.git
   cd traffic-simulator-optimizer
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Verify setup:**
   ```bash
   npm run lint
   ```

### **Running the Application**

**Development mode:**

```bash
npm run dev
```

The application will be accessible at `http://localhost:3000`

**Production build:**

```bash
npm run build
npm start
```

### **Quick Verification (5 Minutes)**

1. Navigate to **Overview** (`http://localhost:3000/overview`)
2. Click **"Start Simulator"** button
3. Wait 10 seconds for metrics to populate
4. Visit **Analytics** tab to observe real-time chart updates
5. Go to **Simulator** and apply **"Rush Hour Peak"** scenario
6. Return to **Overview** and observe queue increase
7. Navigate to **Optimization** and click **"Run Optimizer"**
8. Observe signal timing adjustments and queue stabilization on **Overview**

---

## ✨ Core Features

### 📊 Live Telemetry Dashboard

- Real-time aggregation of queue lengths, vehicle throughput, and average speed across all intersections
- Per-phase congestion metrics (8 phases: 4 intersections × 2 directions)
- Automated alert generation for sustained congestion (threshold: 75% utilization)
- Time-stamped event log with system state annotations

### 📈 Analytics & Performance Metrics

- Time-series visualization: Queue Length, Average Speed, Vehicle Throughput
- Historical data buffer: 30-event rolling window with 10-second and 60-second aggregation
- Real-time metric refresh: 10-second intervals
- Automatic trend detection and visualization via Recharts

### 🎛️ Adaptive Signal Optimization

- AFAPC (Adaptive Fuzzy Actuated Pressure Control) + MPC-lite algorithm
- Execution: Automatic (60-second intervals) or on-demand
- Optimization criteria: Queue pressure, phase starvation, and spillback prevention
- Manual override capability: Stage timing adjustment per intersection (10-50 second range)
- Plan metadata: Strategy classification and optimization timestamp tracking
- Real-time dissemination via Server-Sent Events (SSE)

### 🧪 Traffic Scenario Simulator

- Three pre-configured operational scenarios:
  - **Event Surge**: Incident-induced demand increase (1.2× multiplier)
  - **Lane Closure**: Capacity reduction (simulating infrastructure disruption)
  - **Rush Hour Peak**: Peak-period demand simulation (1.6× multiplier)
- Synthetic traffic generator with Markov regime transitions for demand modeling
- Vehicle propagation model with queue dynamics and spatial correlation
- Real-time scenario application with immediate feedback

### 🔄 Closed-Loop Control Architecture

- Continuous feedback loop: Simulation → Metrics → Optimization → Signal Plan → Simulation
- Fairness mechanisms: Phase starvation detection and compensation
- Performance comparison: Baseline (30/30 splits) vs. optimized allocation
- System reset capability: Return to default baseline at any time

---

## 🏗️ System Architecture

### **Frontend Layer**

- **Framework:** Next.js 14 with App Router (React 18)
- **Type Safety:** TypeScript with strict mode
- **State Management:** `useRealtimeTraffic` custom hook for SSE consumption
- **Visualization:** Recharts for time-series and aggregate metrics
- **Styling:** Tailwind CSS with dark theme
- **UI Components:** Modal dialogs, responsive grids, real-time status indicators

### **Backend Layer**

- **Server Runtime:** Node.js with Next.js API Routes
- **Real-time Communication:** Server-Sent Events (SSE) for state broadcast
- **Traffic Simulator:** 1 Hz tick-based generator with stochastic demand
- **Metrics Aggregation:** 10-second and 60-second rolling windows with alert thresholding
- **Signal Optimizer:** AFAPC algorithm with MPC-lite heuristic
- **State Management:** Intersection queues, vehicle buffers, phase starvation counters

### **API Routes**

| Endpoint        | Purpose                            |
| --------------- | ---------------------------------- |
| `/api/stream`   | SSE events, metrics, plans, alerts |
| `/api/start`    | Start simulator                    |
| `/api/stop`     | Stop simulator                     |
| `/api/config`   | Update demand/incident/noise       |
| `/api/optimize` | Run optimizer                      |
| `/api/reset`    | Reset to 30/30 baseline            |
| `/api/plan`     | Manual stage adjustment            |

---

## 📁 Project Structure

```
├── app/
│   ├── page.tsx              # Home landing page
│   ├── overview/page.tsx      # Live metrics dashboard + controls
│   ├── analytics/page.tsx     # Time-series analytics charts
│   ├── optimization/page.tsx  # Signal plan editor
│   ├── simulator/page.tsx     # Scenario simulator interface
│   └── api/
│       ├── stream/route.ts    # Server-Sent Events endpoint
│       ├── start/route.ts     # Simulator startup
│       ├── stop/route.ts      # Simulator shutdown
│       ├── config/route.ts    # Configuration endpoint
│       ├── optimize/route.ts  # Optimizer execution
│       ├── reset/route.ts     # Reset to baseline
│       └── plan/route.ts      # Manual plan adjustment
├── lib/
│   ├── types.ts              # TypeScript type definitions
│   └── useRealtimeTraffic.ts # Real-time data hook
└── server/
    ├── sse/broker.ts         # SSE connection manager
    ├── sim/state.ts          # Simulator state machine
    ├── sim/simulator.ts      # 1 Hz simulation loop
    ├── stream/aggregator.ts  # Metrics aggregation engine
    └── or/optimizer.ts       # AFAPC optimization algorithm
```

---

## ⚙️ Configuration & Customization

### **Default Simulator Parameters**

Located in [server/sim/state.ts](server/sim/state.ts):

| Parameter            | Default     | Description                            |
| -------------------- | ----------- | -------------------------------------- |
| `baseArrivalRate`    | 12 veh/hr   | Mean vehicle arrivals per intersection |
| `rushHourMultiplier` | 1.6×        | Peak-period demand scaling factor      |
| `incidentMultiplier` | 1.2×        | Incident-induced demand increase       |
| `optimizerThreshold` | 18 vehicles | Queue length triggering optimization   |
| `simulatorTickRate`  | 1 Hz        | Update frequency (1 second cycles)     |

### **Runtime Configuration**

Update simulator parameters via API:

```bash
curl -X POST http://localhost:3000/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "baseArrivalRate": 15,
    "rushHourMultiplier": 2.0,
    "incidentMultiplier": 1.3
  }'
```

---

## 🧠 Optimization Algorithm (AFAPC + MPC-lite)

### **Algorithm Overview**

The adaptive optimizer implements a two-stage approach:

**Stage 1: State Assessment**

1. Aggregate queue lengths, throughput rates, and phase starvation counters
2. Identify saturated phases (queue > optimizer threshold)
3. Detect fairness violations (starvation > 60 seconds)

**Stage 2: Plan Synthesis**

1. Apply starvation compensation: Increase green time for starved phases by 5%
2. Generate candidate timing adjustments: ±1 second variants
3. Evaluate each candidate against 3 demand scenarios (normal, surge, incident)
4. Score candidates using KPI: Minimize total queue while preventing spillback
5. Apply spillback penalty: 1.25× throughput capacity threshold
6. Select optimal splits; revert to baseline if no improvement detected

### **Execution Schedule**

- **Periodic:** Every 60 seconds (automatic)
- **On-demand:** Manual trigger via "Run Optimizer" button
- **Cooldown:** Prevents oscillation through update rate limiting

---

## 📊 Demonstration Walkthrough

**Objective:** Showcase simulator, metrics, and optimization workflow (5 minutes)

### **Step 1: Initialize Baseline (1 min)**

1. Start application: `npm run dev` → navigate to `http://localhost:3000`
2. Select **Overview** from home page
3. Click **"Start Simulator"** button
4. Observe initial system state: Queue lengths = 0, all phases at 30-second baseline

### **Step 2: Verify Metrics Collection (1 min)**

1. Navigate to **Analytics** tab
2. Confirm chart data points appearing (Queue Length, Speed, Throughput)
3. Return to **Overview**; verify metric table updates every 10 seconds

### **Step 3: Apply Demand Scenario (1 min)**

1. Visit **Simulator** tab
2. Click **"Rush Hour Peak"** button
3. Return to **Overview**: Observe queue lengths increasing across all phases

### **Step 4: Run Optimization (1 min)**

1. Navigate to **Optimization** tab
2. Click **"Run Optimizer"** button
3. Observe signal plan updates (splits may change from 30/30 baseline)
4. Return to **Overview**: Queues should decrease, indicating improved efficiency

### **Step 5: Manual Adjustment (1 min)**

1. In **Optimization** tab, click **"Stage Adjust I2"**
2. Drag NS slider to 35 seconds (EW adjusts to 25 seconds)
3. Click **"Apply"** button
4. Observe immediate update on **Overview**: I2 metrics reflect new timing

---


## 📚 Additional Resources

- **GitHub Repository:** [sidk44/traffic-simulator-optimizer](https://github.com/sidk44/traffic-simulator-optimizer)
- **Next.js Documentation:** [nextjs.org](https://nextjs.org/docs)
- **TypeScript Handbook:** [typescriptlang.org](https://www.typescriptlang.org/docs/)
- **Recharts Gallery:** [recharts.org](https://recharts.org/)

## 📝 License

MIT License - See LICENSE file in repository

---

**Adaptive Traffic Signal Optimization System**  
_For research, education, and traffic engineering applications_
