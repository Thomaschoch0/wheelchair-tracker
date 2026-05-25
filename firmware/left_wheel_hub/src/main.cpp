#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

#define FSR_1_PIN A0
#define FSR_2_PIN A1

Adafruit_MPU6050 mpu;

void setup() {
    Serial.begin(115200);

    delay(3000);

    Serial.println();
    Serial.println("LEFT HUB STARTED");

    pinMode(FSR_1_PIN, INPUT);
    pinMode(FSR_2_PIN, INPUT);

    Wire.begin();

    if (!mpu.begin()) {
        Serial.println("MPU6050 NOT FOUND");

        while (1) {
            delay(10);
        }
    }

    Serial.println("MPU6050 CONNECTED");

    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
}

void loop() {

    int fsr1 = analogRead(FSR_1_PIN);
    int fsr2 = analogRead(FSR_2_PIN);

    sensors_event_t accel;
    sensors_event_t gyro;
    sensors_event_t temp;

    mpu.getEvent(&accel, &gyro, &temp);

    Serial.print("FSR1: ");
    Serial.print(fsr1);

    Serial.print(" | FSR2: ");
    Serial.print(fsr2);

    Serial.print(" | ACCEL X: ");
    Serial.print(accel.acceleration.x);

    Serial.print(" Y: ");
    Serial.print(accel.acceleration.y);

    Serial.print(" Z: ");
    Serial.print(accel.acceleration.z);

    Serial.print(" | GYRO X: ");
    Serial.print(gyro.gyro.x);

    Serial.print(" Y: ");
    Serial.print(gyro.gyro.y);

    Serial.print(" Z: ");
    Serial.println(gyro.gyro.z);

    delay(100);
}