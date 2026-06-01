#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <esp_now.h>

// =======================
// RIGHT HUB CONFIG
// =======================

#define HUB_SIDE 'R'

// Force sensor pins
#define FSR_PIN_A0 A0
#define FSR_PIN_A1 A1

// MPU6050 I2C address
#define MPU_ADDR 0x68

// For Adafruit ESP32-S3 Feather
#define SDA_PIN SDA
#define SCL_PIN SCL

// MPU6050 registers
#define PWR_MGMT_1   0x6B
#define WHO_AM_I     0x75
#define ACCEL_XOUT_H 0x3B

// Calibration
#define CALIBRATION_SAMPLES 1000

// Send rate
#define SEND_INTERVAL_MS 50   // 20 Hz

// Broadcast address for testing
// Middle ESP32 should receive this if it is listening with ESP-NOW
uint8_t middleAddress[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};


// =======================
// DATA PACKET
// IMPORTANT: Middle ESP32 must use same struct
// =======================

typedef struct __attribute__((packed)) {
  char side;              // 'L' for left, 'R' for right
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

HubPacket packet;


// =======================
// IMU RAW VALUES
// =======================

int16_t rawAx, rawAy, rawAz;
int16_t rawGx, rawGy, rawGz;

// Offsets from calibration
float accelX_offset = 0.0;
float accelY_offset = 0.0;
float accelZ_offset = 0.0;

float gyroX_offset = 0.0;
float gyroY_offset = 0.0;
float gyroZ_offset = 0.0;

bool imuOnline = false;


// =======================
// MPU6050 FUNCTIONS
// =======================

void writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

uint8_t readRegister(uint8_t reg) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);

  if (Wire.endTransmission(false) != 0) {
    return 0xFF;
  }

  Wire.requestFrom(MPU_ADDR, 1);

  if (Wire.available()) {
    return Wire.read();
  }

  return 0xFF;
}

bool readMPU6050Raw() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(ACCEL_XOUT_H);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  if (Wire.requestFrom(MPU_ADDR, 14) != 14) {
    return false;
  }

  rawAx = (Wire.read() << 8) | Wire.read();
  rawAy = (Wire.read() << 8) | Wire.read();
  rawAz = (Wire.read() << 8) | Wire.read();

  // Skip temperature
  Wire.read();
  Wire.read();

  rawGx = (Wire.read() << 8) | Wire.read();
  rawGy = (Wire.read() << 8) | Wire.read();
  rawGz = (Wire.read() << 8) | Wire.read();

  return true;
}

void getMotionCorrected(
  float &ax, float &ay, float &az,
  float &gx, float &gy, float &gz
) {
  if (!readMPU6050Raw()) {
    ax = ay = az = 0.0;
    gx = gy = gz = 0.0;
    return;
  }

  // Default MPU6050 sensitivity:
  // Accel ±2g: 16384 LSB/g
  // Gyro ±250 deg/s: 131 LSB/(deg/s)
  float axRaw = rawAx / 16384.0;
  float ayRaw = rawAy / 16384.0;
  float azRaw = rawAz / 16384.0;

  float gxRaw = rawGx / 131.0;
  float gyRaw = rawGy / 131.0;
  float gzRaw = rawGz / 131.0;

  ax = axRaw - accelX_offset;
  ay = ayRaw - accelY_offset;
  az = azRaw - accelZ_offset;

  gx = gxRaw - gyroX_offset;
  gy = gyRaw - gyroY_offset;
  gz = gzRaw - gyroZ_offset;
}

void calibrateMPU6050() {
  Serial.println();
  Serial.println("================================");
  Serial.println("RIGHT HUB IMU CALIBRATION");
  Serial.println("Keep the right wheel completely still.");
  Serial.println("Do not touch the wires or wheel.");
  Serial.println("================================");

  delay(2500);

  float sumAx = 0.0;
  float sumAy = 0.0;
  float sumAz = 0.0;

  float sumGx = 0.0;
  float sumGy = 0.0;
  float sumGz = 0.0;

  int validSamples = 0;

  for (int i = 0; i < CALIBRATION_SAMPLES; i++) {
    if (readMPU6050Raw()) {
      float ax = rawAx / 16384.0;
      float ay = rawAy / 16384.0;
      float az = rawAz / 16384.0;

      float gx = rawGx / 131.0;
      float gy = rawGy / 131.0;
      float gz = rawGz / 131.0;

      sumAx += ax;
      sumAy += ay;
      sumAz += az;

      sumGx += gx;
      sumGy += gy;
      sumGz += gz;

      validSamples++;
    }

    delay(2);
  }

  if (validSamples == 0) {
    Serial.println("IMU calibration failed. No valid samples.");
    imuOnline = false;
    return;
  }

  float avgAx = sumAx / validSamples;
  float avgAy = sumAy / validSamples;
  float avgAz = sumAz / validSamples;

  float avgGx = sumGx / validSamples;
  float avgGy = sumGy / validSamples;
  float avgGz = sumGz / validSamples;

  /*
    Your current resting orientation showed:
    ACCEL X ≈ 0
    ACCEL Y ≈ 0
    ACCEL Z ≈ +1.09g

    So we force the calibrated resting position to:
    X = 0g
    Y = 0g
    Z = +1g

    If the right hub is mounted in a different orientation,
    this still calibrates gyro correctly, but accel resting axis
    may need to be adjusted later.
  */
  accelX_offset = avgAx;
  accelY_offset = avgAy;
  accelZ_offset = avgAz - 1.0;

  gyroX_offset = avgGx;
  gyroY_offset = avgGy;
  gyroZ_offset = avgGz;

  Serial.println();
  Serial.println("Calibration complete.");
  Serial.println("Offsets:");

  Serial.print("Accel X offset: ");
  Serial.println(accelX_offset, 4);

  Serial.print("Accel Y offset: ");
  Serial.println(accelY_offset, 4);

  Serial.print("Accel Z offset: ");
  Serial.println(accelZ_offset, 4);

  Serial.print("Gyro X offset: ");
  Serial.println(gyroX_offset, 4);

  Serial.print("Gyro Y offset: ");
  Serial.println(gyroY_offset, 4);

  Serial.print("Gyro Z offset: ");
  Serial.println(gyroZ_offset, 4);

  Serial.println();
}


// =======================
// ESP-NOW FUNCTIONS
// =======================

void onDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  Serial.print("ESP-NOW send status: ");
  Serial.println(status == ESP_NOW_SEND_SUCCESS ? "SUCCESS" : "FAIL");
}

void setupEspNow() {
  WiFi.mode(WIFI_STA);
  delay(100);

  Serial.print("Right hub MAC address: ");
  Serial.println(WiFi.macAddress());

  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    while (true) {
      delay(1000);
    }
  }

  esp_now_register_send_cb(onDataSent);

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, middleAddress, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Failed to add ESP-NOW peer");
    while (true) {
      delay(1000);
    }
  }

  Serial.println("ESP-NOW ready.");
}


// =======================
// SETUP
// =======================

void setup() {
  Serial.begin(115200);
  delay(1500);

  Serial.println();
  Serial.println("================================");
  Serial.println("RIGHT WHEEL HUB STARTING");
  Serial.println("2 FSR + MPU6050 + ESP-NOW SEND");
  Serial.println("================================");

  analogReadResolution(12); // 0 to 4095

  // Optional ESP32 ADC stability settings
  analogSetPinAttenuation(FSR_PIN_A0, ADC_11db);
  analogSetPinAttenuation(FSR_PIN_A1, ADC_11db);

  // Start I2C
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);

  delay(500);

  uint8_t whoami = readRegister(WHO_AM_I);

  Serial.print("MPU6050 WHO_AM_I: 0x");
  Serial.println(whoami, HEX);

  if (whoami == 0x68 || whoami == 0x70) {
    imuOnline = true;
    Serial.println("MPU6050 detected.");

    // Wake up MPU6050
    writeRegister(PWR_MGMT_1, 0x00);
    delay(500);

    calibrateMPU6050();
  } else {
    imuOnline = false;
    Serial.println("MPU6050 NOT detected.");
    Serial.println("FSR data will still send, but IMU values will be zero.");
  }

  setupEspNow();

  Serial.println("Right hub running...");
}


// =======================
// LOOP
// =======================

void loop() {
  static uint32_t lastSendTime = 0;

  if (millis() - lastSendTime < SEND_INTERVAL_MS) {
    return;
  }

  lastSendTime = millis();

  int fsrValueA0 = analogRead(FSR_PIN_A0);
  int fsrValueA1 = analogRead(FSR_PIN_A1);

  float ax = 0.0;
  float ay = 0.0;
  float az = 0.0;
  float gx = 0.0;
  float gy = 0.0;
  float gz = 0.0;

  if (imuOnline) {
    getMotionCorrected(ax, ay, az, gx, gy, gz);
  }

  float accelMag = sqrt(ax * ax + ay * ay + az * az);

  packet.side = HUB_SIDE;
  packet.timestampMs = millis();

  packet.fsrA0 = fsrValueA0;
  packet.fsrA1 = fsrValueA1;

  packet.accelX_g = ax;
  packet.accelY_g = ay;
  packet.accelZ_g = az;

  packet.gyroX_dps = gx;
  packet.gyroY_dps = gy;
  packet.gyroZ_dps = gz;

  packet.accelMag_g = accelMag;

  esp_err_t result = esp_now_send(middleAddress, (uint8_t *)&packet, sizeof(packet));

  Serial.println("--------------------------------");

  Serial.print("FSR A0: ");
  Serial.print(fsrValueA0);

  Serial.print(" | FSR A1: ");
  Serial.println(fsrValueA1);

  Serial.print("ACCEL corrected (g) X: ");
  Serial.print(ax, 3);
  Serial.print(" Y: ");
  Serial.print(ay, 3);
  Serial.print(" Z: ");
  Serial.print(az, 3);
  Serial.print(" | Mag: ");
  Serial.println(accelMag, 3);

  Serial.print("GYRO corrected (deg/s) X: ");
  Serial.print(gx, 2);
  Serial.print(" Y: ");
  Serial.print(gy, 2);
  Serial.print(" Z: ");
  Serial.println(gz, 2);

  Serial.print("ESP-NOW result: ");
  Serial.println(result == ESP_OK ? "sent" : "send error");
}