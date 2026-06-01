#include <Arduino.h>
#include <Wire.h>

#define IMU_ADDR 0x68

// ---------- WRITE REGISTER ----------
void writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(IMU_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

// ---------- READ 16-BIT VALUE ----------
int16_t read16(uint8_t reg) {

  Wire.beginTransmission(IMU_ADDR);
  Wire.write(reg);

  if (Wire.endTransmission(false) != 0) {
    return 0;
  }

  if (Wire.requestFrom(IMU_ADDR, 2) != 2) {
    return 0;
  }

  int16_t high = Wire.read();
  int16_t low = Wire.read();

  return (high << 8) | low;
}

void setup() {

  Serial.begin(115200);

  delay(2000);

  Serial.println("Starting MPU6050...");

  // Use Feather SDA/SCL pins
  Wire.begin(SDA, SCL);

  Wire.setTimeOut(100000);

  delay(100);

  // Wake MPU6050
  writeRegister(0x6B, 0x00);

  delay(100);

  // Set accel range = ±2g
  writeRegister(0x1C, 0x00);

  // Set gyro range = ±250 deg/sec
  writeRegister(0x1B, 0x00);

  Serial.println("MPU6050 READY");
}

void loop() {

  // ---------- ACCEL ----------
  int16_t ax = read16(0x3B);
  int16_t ay = read16(0x3D);
  int16_t az = read16(0x3F);

  // ---------- GYRO ----------
  int16_t gx = read16(0x43);
  int16_t gy = read16(0x45);
  int16_t gz = read16(0x47);

  // ---------- CONVERT ----------
  float ax_g = ax / 16384.0;
  float ay_g = ay / 16384.0;
  float az_g = az / 16384.0;

  float gx_dps = gx / 131.0;
  float gy_dps = gy / 131.0;
  float gz_dps = gz / 131.0;

  // ---------- PRINT ----------
  Serial.println("--------------------------------");

  Serial.print("ACCEL (g)");
  Serial.print("  X: ");
  Serial.print(ax_g, 3);

  Serial.print("  Y: ");
  Serial.print(ay_g, 3);

  Serial.print("  Z: ");
  Serial.println(az_g, 3);

  Serial.print("GYRO (deg/s)");
  Serial.print("  X: ");
  Serial.print(gx_dps, 2);

  Serial.print("  Y: ");
  Serial.print(gy_dps, 2);

  Serial.print("  Z: ");
  Serial.println(gz_dps, 2);

  delay(200);
}