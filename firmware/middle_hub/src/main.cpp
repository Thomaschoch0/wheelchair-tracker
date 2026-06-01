#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>

// Must stay byte-for-byte compatible with the left and right hub senders.
typedef struct __attribute__((packed)) {
  char side;
  uint32_t timestampMs;

  uint16_t fsrA0;
  uint16_t fsrA1;

  float accelX_g;
  float accelY_g;
  float accelZ_g;

  float gyroX_dps;
  float gyroY_dps;
  float gyroZ_dps;

  float accelMag_g;
} HubPacket;

void printMacAddress(const uint8_t *macAddress) {
  for (int i = 0; i < 6; i++) {
    if (i > 0) {
      Serial.print(":");
    }

    if (macAddress[i] < 0x10) {
      Serial.print("0");
    }

    Serial.print(macAddress[i], HEX);
  }
}

void onDataReceived(const uint8_t *macAddress, const uint8_t *incomingData, int length) {
  if (length != sizeof(HubPacket)) {
    Serial.print("Ignored ESP-NOW packet with unexpected size: ");
    Serial.print(length);
    Serial.print(" bytes (expected ");
    Serial.print(sizeof(HubPacket));
    Serial.println(")");
    return;
  }

  HubPacket packet;
  memcpy(&packet, incomingData, sizeof(packet));

  Serial.println("--------------------------------");
  Serial.print("Received from ");
  printMacAddress(macAddress);
  Serial.print(" | Hub: ");
  Serial.println(packet.side);

  Serial.print("Sender timestamp (ms): ");
  Serial.println(packet.timestampMs);

  Serial.print("FSR A0: ");
  Serial.print(packet.fsrA0);
  Serial.print(" | FSR A1: ");
  Serial.println(packet.fsrA1);

  Serial.print("ACCEL corrected (g) X: ");
  Serial.print(packet.accelX_g, 3);
  Serial.print(" Y: ");
  Serial.print(packet.accelY_g, 3);
  Serial.print(" Z: ");
  Serial.print(packet.accelZ_g, 3);
  Serial.print(" | Mag: ");
  Serial.println(packet.accelMag_g, 3);

  Serial.print("GYRO corrected (deg/s) X: ");
  Serial.print(packet.gyroX_dps, 2);
  Serial.print(" Y: ");
  Serial.print(packet.gyroY_dps, 2);
  Serial.print(" Z: ");
  Serial.println(packet.gyroZ_dps, 2);
}

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("================================");
  Serial.println("MIDDLE HUB STARTING");
  Serial.println("ESP-NOW LEFT/RIGHT HUB RECEIVER");
  Serial.println("================================");

  WiFi.mode(WIFI_STA);
  delay(100);

  Serial.print("Middle hub MAC address: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    while (true) {
      delay(1000);
    }
  }

  esp_now_register_recv_cb(onDataReceived);
  Serial.println("ESP-NOW receiver ready.");
}

void loop() {
  delay(1000);
}
