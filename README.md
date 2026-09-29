# ReachPay — Merchant Payments, BBPS & Financial Services Hub

A modern, production-ready React + Vite application for merchant payment management, Bharat Bill Payment System (BBPS) utility services, POS-assisted card transactions, and Domestic Money Transfer (DMT).

## Tech Stack
- **Framework**: React 19 + Vite
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`)
- **Icons**: Lucide React
- **Analytics & Charts**: Recharts

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn / pnpm

### Local Development
```bash
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build
```bash
npm run build
npm run preview
```
Production assets are generated into the `dist/` directory.

## Deploying to Vercel

This repository is pre-configured for one-click deployment on **Vercel**:

| Setting | Value |
| --- | --- |
| **Framework Preset** | `Vite` |
| **Root Directory** | `./` |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

Single-page application (SPA) routing fallbacks are configured via [`vercel.json`](./vercel.json).

## Features
- **Merchant Dashboard**: Real-time stats, revenue trends, volume analytics.
- **BBPS / Bill Payments Hub**: Electricity, Gas, Water, Credit Card bills, FASTag, Recharges with bill fetch simulation.
- **Assisted Banking & POS**: Simulated ₹1,00,000 POS card transaction, instant wallet credit, and IMPS/NEFT transfers.
- **Merchant Wallet**: Unified live balance, instant credit/debit tracking, transfer to bank.
- **Unified Transactions Ledger**: Filter by POS, BBPS, Recharges, Transfers with receipts.
- **Receipts**: ReachPay branded receipts with PDF download and print options.
