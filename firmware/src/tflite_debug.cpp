/**
 * TensorFlow Lite Micro Debug Log Implementation
 * 
 * Required by TFLite Micro library for logging output.
 */

#include <Arduino.h>

// TFLite Micro expects these functions to be implemented by the user

extern "C" void DebugLog(const char* s) {
    Serial.print(s);
}

// Test over serial implementations (required by the library but not used)
namespace test_over_serial {
    void SerialWrite(const char* s) {
        Serial.print(s);
    }
    
    char* SerialReadLine(int timeout_ms) {
        // Not used in production - return empty
        static char empty[] = "";
        return empty;
    }
}
