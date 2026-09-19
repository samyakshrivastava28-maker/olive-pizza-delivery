# 🍕 Olive Pizza Delivery — Rider Navigation & Realtime GPS Logistics

[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.1-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Capacitor](https://img.shields.io/badge/Capacitor-7.6-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![MapLibre](https://img.shields.io/badge/MapLibre-3D%20GPS-396BFF?logo=maplibre&logoColor=white)](https://maplibre.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

> **Olive Pizza Delivery** is the mobile logistics and turn-by-turn navigation application built for Olive Pizza delivery riders and fleet drivers. Runs on Mobile Web (Port 5177) and native Android/iOS via Capacitor.

---

## 🌟 Key Features & Logistics Systems

### 🚨 1. High-Urgency Order Assignment Modal
* **Full Order Details**: Un-truncated itemized list displaying exact pizza varieties, sizes, crusts, and notes.
* **Unambiguous Payment Badges**:
  - `⚠️ CASH TO COLLECT FROM CUSTOMER: ₹XXX` (for Cash on Delivery orders).
  - `✅ ONLINE PAID: DO NOT COLLECT CASH` (for prepaid online orders).
* **1-Tap Actions**:
  - Instant phone dialer button (`tel:${phone}`) to contact the customer.
  - 1-tap Google Maps directions button.
  - Customer drop-off instructions callout box.
  - Action buttons: `ACCEPT DELIVERY`, `DECLINE`, and `SILENCE ALARM`.
* **Audible Alarm Loop**: Continuous chime alert (`delivery_chime.mp3`) alerting the rider of new delivery dispatches.

### 🧭 2. Turn-by-Turn 3D GPS Navigation
* **Dual-Mode 3D Map (MapLibre GL)**:
  - **Auto-Follow Mode**: 45° tilted 3D perspective rotated dynamically in the rider's direction of travel.
  - **Overview Mode**: Tapping or dragging smoothly drops the camera to a 0° top-down orientation.
* **OSRM Routing Engine**: Pre-calculates optimal road route, live distance, and estimated time of arrival (ETA).
* **Neural Voice Guidance**: On-device Text-to-Speech (TTS) delivering voice prompts in English, Hindi, and Hinglish for upcoming turns.

### 📡 3. High-Frequency GPS Telemetry
* Broadcasts rider GPS coordinates, heading, speed, and accuracy to the backend every 3–5 seconds.
* Live coordinates are streamed through the backend WebSocket gateway and Supabase PostgreSQL to the customer's 3D tracking map with smooth 60fps interpolation.

### 🛡️ 4. Geofences & Operational Rules
* **300m Store Departure Reminder**: If a rider departs the restaurant vicinity without marking the order as `picked_up`, an automated alarm alerts them to update status.
* **200m Delivery Completion Geofence**: Server-side validation prevents orders from being marked as `delivered` unless the rider is physically within 200 meters of the customer's coordinates.
* **Photo Proof of Delivery**: Allows capturing camera proof of delivery for contactless handovers.

---

## 🏗️ Technical Architecture & Stack

- **Frontend Core**: React 19, TypeScript, Vite 6, Tailwind CSS v4
- **State Management**: Zustand
- **Mobile Container**: Capacitor 7 (Android / iOS)
- **Geolocation**: `@capacitor/geolocation` with native high-accuracy GPS watcher
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

### 3. Environment Configuration
Create a `.env` file in the project root:
```env
VITE_API_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000/ws
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=olive-pizza-08.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=olive-pizza-08
VITE_FIREBASE_STORAGE_BUCKET=olive-pizza-08.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Running Locally
```bash
# Start Vite development server on port 5177
npm run dev
```

### 5. Building for Production & Mobile Containers
```bash
# Web application build
npm run build

# Sync web assets to Capacitor Android/iOS containers
npx cap sync android
npx cap sync ios
```

---

## 📄 License

Proprietary Software — All rights reserved by **Olive Pizza**, Rajnandgaon, Chhattisgarh, India.
