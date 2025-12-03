# Severn Edge AI 

Complete Machine Learning Education Platform for Arduino BLE

## Overview

Severn Edge AI enables 5th-grade students to collect motion data, train gesture recognition models, and deploy them to Arduino microcontrollers. The system teaches core ML concepts through hands-on experience with real hardware.

## Features

- **Kid-Friendly UX**: Fun animations, gentle validation, celebratory feedback
- **Two Deployment Modes**:
  - **Light Mode**: Browser-only, zero server setup (perfect for single class)
  - **Full Mode**: Server-based with teacher dashboard (multi-class support)
- **Hardware Support**: Arduino Nano 33 BLE Sense Rev1 (LSM9DS1) and Rev2 (BMI270)
- **FERPA-Compliant**: No student PII, session-based data, auto-delete
- **Flexible Lessons**: 15/30/45 minute tiers for different class schedules

## Project Structure

```
severn-edge-ai/
├── firmware/              # Arduino firmware (PlatformIO)
│   ├── src/
│   ├── lib/
│   └── platformio.ini
├── web-app/              # React + TypeScript + Vite
│   ├── src/
│   ├── public/
│   └── package.json
├── server/               # FastAPI backend (Full Mode only)
│   ├── routers/
│   ├── services/
│   └── requirements.txt
├── deployment/           # Docker configs
│   └── docker-compose.yml
└── docs/                 # Documentation
```

## Quick Start

### Light Mode (No Server)

1. Flash firmware to Arduino Nano 33 BLE Sense
2. Open web app in Chrome/Edge
3. Students: Connect → Collect → Train → Test

### Full Mode (With Server)

1. Deploy server with Docker
2. Teacher creates class session
3. Students join with code
4. Server handles training/deployment

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Hardware | Arduino Nano 33 BLE Sense (Rev1/Rev2) |
| Firmware | PlatformIO + TensorFlow Lite Micro |
| Communication | Web Bluetooth (25Hz, int16, CRC-8) |
| Web App | React + TypeScript + Vite + TailwindCSS |
| Training (Light) | TensorFlow.js |
| Training (Full) | TensorFlow (Python) |
| Server | FastAPI + Celery + Redis + PostgreSQL |
| Deployment | Docker + Nginx |

## Development Status

- [x] Specification complete (v3.1)
- [ ] Arduino firmware
- [ ] Web application (Light Mode)
- [ ] Server architecture (Full Mode)
- [ ] Teacher dashboard
- [ ] Deployment infrastructure

## Contact

s.kembo@severnschool.com

## License

Educational use - Severn School
