# 🍕 Olive Pizza Delivery — Rider Navigation & Realtime GPS Logistics

[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.1-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-7.6-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Live_GPS_Database-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![MapLibre](https://img.shields.io/badge/MapLibre-3D%20GPS-396BFF?logo=maplibre&logoColor=white)](https://maplibre.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

> **Olive Pizza Delivery** is the mobile logistics and turn-by-turn navigation application built for Olive Pizza delivery riders and fleet drivers. Runs on Mobile Web (Port 5177) and native Android/iOS via Capacitor.

---

## 🌟 Key Features & Logistics Systems

### 📡 1. Authoritative Live GPS Pipeline (Supabase Telemetry)
* **API-Routed Ingestion**: Rider telemetry is transmitted strictly via the backend `/api/delivery/rider/location` endpoint directly to the **Supabase Live GPS Database** (`public.delivery_locations`). Zero direct, unauthorized client writes.
* **Dynamic Transmission Intervals**:
  - **Active Order Delivery** (`activeOrderId != null`): High-frequency updates every **1.5 seconds** for fluid turn-by-turn live customer tracking.
  - **Idle Online** (`activeOrderId == null`): Low-frequency presence heartbeats every **25 seconds** to conserve battery and cellular data.
* **Offline Breadcrumb Buffer (`offlineGpsBuffer.ts`)**:
  - Automatically buffers up to 50 GPS points locally when driving through network dead zones.
  - Idempotently flushes buffered coordinates to the server upon reconnecting.

### 🚨 2. High-Urgency Order Assignment Modal
* **Full Order Details**: Un-truncated itemized list displaying exact pizza varieties, sizes, crusts, and special notes.
* **Unambiguous Payment Badges**:
  - `⚠️ CASH TO COLLECT FROM CUSTOMER: ₹XXX` (for Cash on Delivery orders).
  - `✅ ONLINE PAID: DO NOT COLLECT CASH` (for prepaid online orders).
* **1-Tap Actions**:
  - Instant phone dialer button (`tel:${phone}`) to contact the customer.
  - 1-tap Google Maps directions button.
  - Customer drop-off instructions callout box.
  - Action buttons: `ACCEPT DELIVERY`, `DECLINE`, and `SILENCE ALARM`.
* **Audible Alarm Loop**: Continuous chime alert (`delivery_chime.mp3`) alerting the rider of new delivery dispatches.

### 🧭 3. Turn-by-Turn 3D GPS Navigation
* **Dual-Mode 3D Map (MapLibre GL)**:
  - **Auto-Follow Mode**: 45° tilted 3D perspective rotated dynamically in the rider's direction of travel.
  - **Overview Mode**: Tapping or dragging smoothly drops the camera to a 0° top-down orientation.
* **OSRM Routing Engine**: Pre-calculates optimal road route, live distance, and estimated time of arrival (ETA).
* **Neural Voice Guidance**: On-device Text-to-Speech (TTS) delivering voice prompts in English, Hindi, and Hinglish for upcoming turns.

### 🛡️ 4. Geofences & Operational Rules
* **300m Store Departure Reminder**: If a rider departs the restaurant vicinity without marking the order as `picked_up`, an automated alarm alerts them to update status.
* **200m Delivery Completion Geofence**: Server-side validation prevents orders from being marked as `delivered` unless the rider is physically within 200 meters of the customer's destination coordinates.
* **Photo Proof of Delivery**: Allows capturing camera proof of delivery for contactless handovers.

### 🛡️ 5. Clean Centralized Authentication & DPDP Compliance
* **Single Root Auth Listener**: Firebase auth state is observed once at application root (`App.tsx`), eliminating duplicate handshake requests.
* **Customer Data Masking**: In compliance with Indian DPDP Act 2023, raw customer telephone numbers are scrubbed from push notification payloads.

---

## 🏗️ Technical Architecture & Stack

- **Frontend Core**: React 19, TypeScript, Vite 6, Tailwind CSS v4
- **State Management**: Zustand
- **Mobile Container**: Capacitor 7 (Android / iOS)
- **Geolocation**: Native high-accuracy GPS watcher with background throttling
- **Live Database**: Supabase PostgreSQL (`public.delivery_locations`) via backend gateway
- **Map & Routing**: MapLibre GL JS, OSRM Routing API, Leaflet
- **Audio & TTS**: HTML5 Web Audio API, Web Speech Synthesis

---

## ⚡ Getting Started

### 1. Prerequisites
- Node.js `v20+` or `v22+`
- Central Backend running on `http://localhost:5000` (or configured production backend)

### 2. Installation
```bash
cd olive-pizza-delivery
npm install
```

### 3. Running Locally
```bash
# Start Vite development server on port 5177
npm run dev
```

### 4. Building for Mobile Containers
```bash
# Build web assets and sync to Capacitor
npm run build
npx cap sync android
npx cap sync ios
```

---

## 📜 License

Proprietary © Olive Pizza. All rights reserved.
