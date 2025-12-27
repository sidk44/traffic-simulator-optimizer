# 🚦 Adaptive Traffic Control System

A real-time adaptive traffic signal optimization platform built with Next.js 14, TypeScript, Recharts, and SSE (Server-Sent Events). Monitor live traffic metrics, run optimization algorithms, and simulate scenarios from an interactive web dashboard.

---

## ✨ Features

### 📊 **Live Telemetry Dashboard**

- Real-time queue lengths, throughput, and average speed per intersection
- Phase-level congestion metrics (8 phases: I1-I4 × NS/EW)
- Active alerts for sustained congestion
- Live event log with timestamps

### 📈 **Analytics & Trending**

- Time-series charts for Queue Length, Speed, and Throughput
- 30-event history buffer
- 10s and 60s aggregated windows
- Automatic metric updates every 10 seconds

### 🎛️ **Signal Optimization**

- AFAPC + MPC-lite optimizer runs every 60s or on-demand
- Automated plan adjustment based on queue pressure and starvation
- Manual stage adjustment (drag slider to tune NS/EW splits)
- Plan metadata tracking (strategy: baseline/optimized/suggested)
- Instant broadcast of plan changes via SSE

### 🧪 **Scenario Simulator**

- Pre-configured scenarios: Event Surge, Lane Closure, Rush Hour Peak
- 1 Hz synthetic traffic simulator with Markov regime transitions
- Spatial propagation and queue dynamics
- Configurable noise and packet loss
- Real-time scenario application

### 🔄 **Closed-Loop Control**

- Automatic optimizer execution
- Starvation-aware fairness boost
- Baseline vs. optimized KPI comparison
- Reset to 30/30 baseline at any time

---

## 🚀 Quick Start

### **Installation**

```bash
npm install
npm run dev
```

Open `http://localhost:3000`

### **Test All Features (5 minutes)**

1. **Overview** (`/overview`) → Click "Start Simulator"
2. **Wait 10s** → Metrics populate, queues shown
3. **Analytics** (`/analytics`) → Watch 3 charts update in real-time
4. **Simulator** (`/simulator`) → Click "Rush hour peak" scenario
5. **Optimization** (`/optimization`) → Click "Run Optimizer" → Splits adjust
6. **Overview** → Queues stabilize after optimization

---

## 🏗️ Architecture

### **Frontend**

- Next.js 14 App Router
- Real-time hook: `useRealtimeTraffic` (SSE client)
- Charts: Recharts
- Styling: Tailwind CSS

### **Backend**

- SSE Broker: Connection + caching
- Simulator: 1 Hz tick loop, phase sampling
- Aggregator: 10s/60s metrics, alerts
- Optimizer: AFAPC + MPC-lite
- State: Queue + buffer + starvation logic

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

## 📁 Structure

```
├── app/
│   ├── page.tsx              # Home (4 panels)
│   ├── overview/page.tsx      # Live metrics + controls
│   ├── analytics/page.tsx     # 3 charts
│   ├── optimization/page.tsx  # Plan editor
│   ├── simulator/page.tsx     # Scenarios
│   └── api/
│       ├── stream/route.ts    # SSE
│       ├── start/route.ts     # Start
│       ├── stop/route.ts      # Stop
│       ├── config/route.ts    # Config
│       ├── optimize/route.ts  # Optimizer
│       ├── reset/route.ts     # Reset
│       └── plan/route.ts      # Manual plan
├── lib/
│   ├── types.ts              # TypeScript types
│   └── useRealtimeTraffic.ts # SSE hook
└── server/
    ├── sse/broker.ts         # SSE manager
    ├── sim/state.ts          # Simulator core
    ├── sim/simulator.ts      # 1 Hz loop
    ├── stream/aggregator.ts  # Metrics
    └── or/optimizer.ts       # AFAPC optimizer
```

---

## 🧪 Testing Checklist

### Overview Page

- ✅ Start/Stop buttons work
- ✅ Metrics update every 10s
- ✅ Alerts appear when congestion > 75
- ✅ Events log shows live updates
- ✅ Reset clears all metrics

### Analytics Page

- ✅ Queue chart updates
- ✅ Speed chart fluctuates 5-45 mph
- ✅ Throughput shows smooth area
- ✅ 30+ data points accumulate

### Optimization Page

- ✅ Optimizer changes splits from 30/30
- ✅ Reset returns to 30/30
- ✅ Stage adjustment modal works
- ✅ Splits clamp to 10-50s range
- ✅ Plan metadata shows strategy + timestamp

### Simulator Page

- ✅ Event surge increases arrivals
- ✅ Lane closure reduces throughput
- ✅ Rush hour spikes demand
- ✅ Recent events show system notes

### Cross-Page

- ✅ Open 2 tabs → Changes sync via SSE
- ✅ No console errors
- ✅ No duplicate key warnings
- ✅ `/api/stream` stays open (Network tab)

---

## ⚙️ Configuration

Default simulator settings in `server/sim/state.ts`:

- Base arrival: 12 veh/hr
- Rush hour: 1.6× multiplier
- Incident: 1.2× multiplier
- Optimizer threshold: 18 veh

Update via POST `/api/config`:

```json
{
  "baseArrivalRate": 15,
  "rushHour": 2.0
}
```

---

## 🧠 Optimizer (AFAPC + MPC-lite)

1. Reads queue + throughput + starvation
2. Boosts starved phases +5% green
3. Tests ±1s adjustments, picks best
4. Evaluates 3 demand scenarios
5. Penalizes spillback (queue > 1.25× throughput)
6. Outputs optimized splits + KPIs

**Runs:** Every 60s (if enabled) or on-demand via button

---

## 🎨 UI Features

- Dark theme (slate/sky/emerald)
- Real-time status indicators
- Modal dialogs for adjustments
- Responsive grids
- Loading states
- Smooth chart animations

---

## 🔧 Troubleshooting

**No data?**

- Click "Start" button on Overview
- Check `/api/stream` in Network tab (status 200, pending)
- Wait 10s for metrics

**Optimizer not working?**

- Wait 60+ seconds or click "Run Optimizer" manually
- Need 60s of metrics history first

**TypeScript errors?**

```bash
npm run lint
npm run dev
```

---

## 📊 Demo Flow (5 min)

1. Home → Overview
2. Start Simulator
3. Wait 10s, check metrics
4. Analytics → Watch charts
5. Simulator → "Rush hour peak"
6. Overview → Queues spike
7. Optimization → "Run Optimizer"
8. Overview → Queues drop (optimized splits)
9. Optimization → "Stage Adjust I2" → Apply
10. Overview → I2 splits updated instantly

---

## 📝 License

MIT

---

**Built with ❤️ for adaptive traffic control**
