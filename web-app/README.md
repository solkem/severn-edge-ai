# Severn Edge AI - Web Application

Browser-based interface for collecting data, training models, and testing gesture recognition.

## Features

- **Light Mode** (No Server Required)
  - BLE communication with Arduino
  - In-browser training with TensorFlow.js
  - Local data storage (IndexedDB)
  - Offline capable

- **Kid-Friendly UX**
  - Confetti celebrations
  - Encouraging messages
  - Visual progress indicators
  - Simple workflow

## Quick Start

### Development

```bash
npm install
npm run dev
```

Open http://localhost:5173 in Chrome or Edge (Web Bluetooth required)

### Production Build

```bash
npm run build
npm run preview
```

## Browser Requirements

- **Chrome 56+** or **Edge 79+** (Web Bluetooth support)
- Bluetooth must be enabled
- HTTPS required (except localhost)

## Architecture

```
src/
├── components/        # Reusable UI components
│   └── KidFeedback.tsx
├── pages/            # Main workflow pages
│   ├── ConnectPage.tsx
│   ├── CollectPage.tsx
│   ├── TrainPage.tsx
│   └── TestPage.tsx
├── services/         # Business logic
│   ├── bleService.ts
│   ├── bleParser.ts
│   └── trainingService.ts
├── types/            # TypeScript definitions
│   ├── ble.ts
│   └── index.ts
├── utils/            # Helper functions
│   └── crc8.ts
└── App.tsx           # Main application
```

## Student Workflow

### 1. Connect (1 minute)
- Click "Connect to Arduino"
- Select Severn device from popup
- View device info

### 2. Collect (10-15 minutes)
- Record 10 samples per gesture
- Real-time quality feedback
- Progress tracking

### 3. Train (30 seconds)
- Click "Start Training"
- Watch progress bar
- See final accuracy

### 4. Test (5+ minutes)
- Perform gestures
- See live predictions
- View confidence scores

## Technologies

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **TensorFlow.js** - ML training
- **Web Bluetooth** - Arduino communication
- **Canvas Confetti** - Celebrations
- **IDB** - Local storage

## Troubleshooting

### "Web Bluetooth API not available"
- Use Chrome or Edge browser
- Ensure HTTPS (or localhost)
- Enable Bluetooth on device

### "Failed to connect"
- Arduino must be powered on
- Bluetooth enabled
- Device within range (<30 feet)

### "Low accuracy after training"
- Record more distinct gestures
- Increase samples per gesture
- Ensure consistent movements

## License

Educational use - Severn School
