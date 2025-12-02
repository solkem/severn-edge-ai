# Severn Edge AI - Arduino Firmware

BLE-enabled firmware for gesture recognition using TensorFlow Lite Micro.

## Supported Hardware

- **Arduino Nano 33 BLE Sense Rev1** (LSM9DS1 IMU)
- **Arduino Nano 33 BLE Sense Rev2** (BMI270 IMU)

## Features

- Hardware abstraction layer (works with both Rev1 and Rev2)
- CRC-8 protected BLE packets
- Two operating modes:
  - **Collect Mode**: Stream sensor data for training
  - **Inference Mode**: Run on-device ML predictions
- Sliding window inference (100 samples, 50-sample stride)
- 25Hz sample rate (configurable)

## Building with PlatformIO

### 1. Install PlatformIO

```bash
# Using pip
pip install platformio

# Or install VS Code extension: PlatformIO IDE
```

### 2. Select Your Board Revision

Edit `platformio.ini` and uncomment the correct sensor:

```ini
; For Rev1 boards:
-DUSE_LSM9DS1

; For Rev2 boards:
-DUSE_BMI270
```

### 3. Build and Upload

```bash
cd firmware

# Build firmware
pio run

# Upload to board (connect via USB)
pio run --target upload

# Monitor serial output
pio device monitor
```

## BLE Protocol

### Service UUID
`19B10000-E8F2-537E-4F6C-D104768A1214`

### Characteristics

| UUID Suffix | Name | Size | Description |
|-------------|------|------|-------------|
| 0x0001 | Mode | 1B | 0=Collect, 1=Inference |
| 0x0002 | Sensor | 17B | IMU data + CRC |
| 0x0003 | Inference | 4B | Prediction + confidence |
| 0x0004 | DeviceInfo | 20B | Version, chip, stats |
| 0x0005 | Config | 4B | Sample rate, window size |

### Sensor Packet (17 bytes)

```
Bytes 0-1:   ax (int16) - Acceleration X
Bytes 2-3:   ay (int16) - Acceleration Y
Bytes 4-5:   az (int16) - Acceleration Z
Bytes 6-7:   gx (int16) - Gyroscope X
Bytes 8-9:   gy (int16) - Gyroscope Y
Bytes 10-11: gz (int16) - Gyroscope Z
Bytes 12-13: sequence (uint16) - Packet counter
Bytes 14-15: timestamp (uint16) - Milliseconds mod 65536
Byte 16:     crc (uint8) - CRC-8/MAXIM checksum
```

**Scaling:**
- Acceleration: `int16 ÷ 8192 → g (±4g range)`
- Gyroscope: `int16 ÷ 16.4 → dps (±2000°/s range)`

## Project Structure

```
firmware/
├── platformio.ini          # Build configuration
├── src/
│   ├── main.cpp           # Main firmware logic + BLE
│   ├── config.h           # Constants and UUIDs
│   ├── sensor_reader.h    # Hardware abstraction interface
│   ├── sensor_bmi270.cpp  # Rev2 sensor implementation
│   ├── sensor_lsm9ds1.cpp # Rev1 sensor implementation
│   ├── inference.h        # TFLite inference interface
│   └── inference.cpp      # Inference engine
└── lib/                   # External libraries (managed by PlatformIO)
```

## Configuration

Edit [src/config.h](src/config.h) to customize:

- `DEFAULT_SAMPLE_RATE_HZ` - Sample rate (10-50Hz)
- `WINDOW_SIZE` - Inference window size (default: 100)
- `WINDOW_STRIDE` - Sliding window stride (default: 50)
- `TENSOR_ARENA_SIZE` - TFLite memory (default: 12KB)

## Debugging

Enable debug output by uncommenting in `config.h`:

```cpp
#define DEBUG_MODE
```

Then monitor serial output:

```bash
pio device monitor
```

## Memory Usage

- **Flash**: ~50KB (without model) + model size (~12KB)
- **RAM**: ~15KB (tensor arena + buffers)
- **Free RAM**: ~250KB on Nano 33 BLE

## Troubleshooting

### "No IMU detected"
- Check correct sensor #define (LSM9DS1 or BMI270)
- Verify board is Nano 33 BLE Sense (not regular Nano 33 BLE)

### BLE connection fails
- Enable Bluetooth on client device
- Move closer to device
- Reset board and retry

### High packet loss
- Reduce sample rate to 15Hz
- Check for BLE interference
- Verify CRC checksums on client

## Next Steps

1. ✅ Firmware compiles and runs
2. ⏳ Train a model using web app
3. ⏳ Deploy trained model to firmware
4. ⏳ Test inference mode

## License

Educational use - Severn School
