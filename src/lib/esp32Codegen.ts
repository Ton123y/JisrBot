import { SIGN_LEXICON, isValidSignId } from './signLanguage.ts';
import type { SignId } from './signLanguage.ts';

export type MqttMode = 'public' | 'hivemq_cloud';

export interface MqttConfig {
  mode: MqttMode;
  brokerHost: string;
  port: number;
  useTls: boolean;
  topicPrefix: string;
  username?: string;
  password?: string;
}

export interface RobotCommandPayload {
  id: string;
  action: 'set_led' | 'set_arm_angle' | 'set_motor_speed' | 'perform_sign' | 'reset' | 'ping';
  ledState?: boolean;
  armAngle?: number;
  motorSpeed?: number;
  signGesture?: SignId;
  servoAngles?: [number, number, number, number, number];
  note?: string;
  timestamp: string;
}

export interface RobotState {
  ledOn: boolean;
  armAngle: number; // 0 to 180 deg
  motorSpeed: number; // 0 to 100 %
  activeSign: SignId;
  servoAngles: [number, number, number, number, number];
  lastUpdated: string;
}

export const DEFAULT_MQTT_CONFIG: MqttConfig = {
  mode: 'public',
  brokerHost: 'broker.emqx.io',
  port: 1883,
  useTls: false,
  topicPrefix: 'suez_project_99482_secret_x7z',
  username: '',
  password: '',
};

export const PUBLIC_BROKER_PRESETS = [
  { label: 'EMQX Public (broker.emqx.io)', host: 'broker.emqx.io', port: 1883 },
  { label: 'HiveMQ Public (broker.hivemq.com)', host: 'broker.hivemq.com', port: 1883 },
  { label: 'Mosquitto Test (test.mosquitto.org)', host: 'test.mosquitto.org', port: 1883 },
] as const;

const HOSTNAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const TOPIC_REGEX = /^[a-zA-Z0-9_-]{4,64}(\/[a-zA-Z0-9_-]{1,32})*$/;

export function isPrivateOrLoopbackHost(host: string): boolean {
  const lower = host.trim().toLowerCase();
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1' || lower === '0.0.0.0') {
    return true;
  }
  if (/^10\./.test(lower) || /^192\.168\./.test(lower) || /^169\.254\./.test(lower)) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(lower)) {
    return true;
  }
  return false;
}

export function validateMqttConfig(input: Partial<MqttConfig>): { ok: true; config: MqttConfig } | { ok: false; error: string } {
  const mode: MqttMode = input.mode === 'hivemq_cloud' ? 'hivemq_cloud' : 'public';
  const brokerHost = String(input.brokerHost ?? '').trim();
  const topicPrefix = String(input.topicPrefix ?? '').trim().replace(/^\/+|\/+$/g, '');
  const useTls = mode === 'hivemq_cloud' ? true : Boolean(input.useTls);
  const port = Number(input.port ?? (mode === 'hivemq_cloud' ? 8883 : 1883));
  const username = input.username ? String(input.username).trim() : '';
  const password = input.password ? String(input.password) : '';

  if (!brokerHost || !HOSTNAME_REGEX.test(brokerHost) || isPrivateOrLoopbackHost(brokerHost)) {
    return { ok: false, error: 'اسم سيرفر MQTT غير صالح. استخدم نطاقاً عاماً مثل broker.emqx.io أو رابط HiveMQ Cloud.' };
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, error: 'رقم البورت غير صالح (يجب أن يكون بين 1 و 65535).' };
  }

  if (!topicPrefix || !TOPIC_REGEX.test(topicPrefix)) {
    return { ok: false, error: 'اسم القناة (Topic) يجب أن يحتوي على 4 أحرف إنجليزية أو أرقام أو شرطة سفلية على الأقل بدون مسافات.' };
  }

  if (mode === 'hivemq_cloud' && (!username || !password)) {
    return { ok: false, error: 'خيار HiveMQ Cloud يتطلب إدخال اسم المستخدم (Username) وكلمة المرور (Password).' };
  }

  return {
    ok: true,
    config: {
      mode,
      brokerHost,
      port,
      useTls,
      topicPrefix,
      username: mode === 'hivemq_cloud' ? username : undefined,
      password: mode === 'hivemq_cloud' ? password : undefined,
    },
  };
}

export function generateSecretTopicPrefix(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `jisrbot_esp32_${suffix}`;
}

export function getCommandTopic(prefix: string): string {
  const clean = prefix.replace(/^\/+|\/+$/g, '');
  return `${clean}/esp32/cmd`;
}

export function getStatusTopic(prefix: string): string {
  const clean = prefix.replace(/^\/+|\/+$/g, '');
  return `${clean}/esp32/status`;
}

export function buildRobotCommandPayload(input: {
  action: RobotCommandPayload['action'];
  ledState?: boolean;
  armAngle?: number;
  motorSpeed?: number;
  signGesture?: string;
  note?: string;
}): RobotCommandPayload {
  const signId: SignId | undefined =
    input.signGesture && isValidSignId(input.signGesture.toUpperCase())
      ? (input.signGesture.toUpperCase() as SignId)
      : undefined;

  const servoAngles = signId ? SIGN_LEXICON[signId].servoTargets : undefined;
  const clampedArm =
    typeof input.armAngle === 'number' ? Math.max(0, Math.min(180, Math.round(input.armAngle))) : undefined;
  const clampedMotor =
    typeof input.motorSpeed === 'number' ? Math.max(0, Math.min(100, Math.round(input.motorSpeed))) : undefined;

  return {
    id: `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    action: input.action,
    ...(typeof input.ledState === 'boolean' ? { ledState: input.ledState } : {}),
    ...(typeof clampedArm === 'number' ? { armAngle: clampedArm } : {}),
    ...(typeof clampedMotor === 'number' ? { motorSpeed: clampedMotor } : {}),
    ...(signId ? { signGesture: signId } : {}),
    ...(servoAngles ? { servoAngles } : {}),
    ...(input.note ? { note: input.note } : {}),
    timestamp: new Date().toISOString(),
  };
}

export function applyCommandToRobotState(state: RobotState, cmd: RobotCommandPayload): RobotState {
  const next: RobotState = {
    ...state,
    servoAngles: [...state.servoAngles] as [number, number, number, number, number],
    lastUpdated: cmd.timestamp,
  };

  if (cmd.action === 'reset') {
    return {
      ledOn: false,
      armAngle: 90,
      motorSpeed: 0,
      activeSign: 'REST',
      servoAngles: [...SIGN_LEXICON.REST.servoTargets] as [number, number, number, number, number],
      lastUpdated: cmd.timestamp,
    };
  }

  if (typeof cmd.ledState === 'boolean') {
    next.ledOn = cmd.ledState;
  }
  if (typeof cmd.armAngle === 'number') {
    next.armAngle = cmd.armAngle;
  }
  if (typeof cmd.motorSpeed === 'number') {
    next.motorSpeed = cmd.motorSpeed;
  }
  if (cmd.signGesture && isValidSignId(cmd.signGesture)) {
    next.activeSign = cmd.signGesture;
    next.servoAngles = [...SIGN_LEXICON[cmd.signGesture].servoTargets] as [number, number, number, number, number];
  }

  return next;
}

export function generateEsp32Sketch(config: MqttConfig): string {
  const cmdTopic = getCommandTopic(config.topicPrefix);
  const statusTopic = getStatusTopic(config.topicPrefix);
  const isCloud = config.mode === 'hivemq_cloud' || config.useTls;

  return `/*
 * JisrBot ESP32 Firmware — Human-Robot & Sign Language Bridge
 * Mode: ${isCloud ? 'HiveMQ Cloud (TLS Port 8883 + Auth)' : 'Public MQTT Broker (Port 1883 + Secret Topic)'}
 * Required Libraries: PubSubClient, ArduinoJson, ESP32Servo
 */

#include <WiFi.h>
${isCloud ? '#include <WiFiClientSecure.h>' : ''}
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

// 1. Wi-Fi Credentials
const char* WIFI_SSID     = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// 2. MQTT Broker Configuration
const char* MQTT_HOST     = "${config.brokerHost}";
const int   MQTT_PORT     = ${config.port};
const char* TOPIC_CMD     = "${cmdTopic}";
const char* TOPIC_STATUS  = "${statusTopic}";
${
  isCloud
    ? `const char* MQTT_USER     = "${config.username || 'YOUR_HIVEMQ_USERNAME'}";
const char* MQTT_PASS     = "${config.password ? '********' : 'YOUR_HIVEMQ_PASSWORD'}";`
    : ''
}

// 3. Hardware Pins (ESP32)
const int PIN_LED         = 2;   // Built-in LED or Relay
const int PIN_MOTOR_PWM   = 13;  // DC Motor / Actuator PWM
const int PIN_ARM_SERVO   = 14;  // Wrist / Arm Elevation Servo
const int FINGER_PINS[5]  = {18, 19, 21, 22, 23}; // Thumb, Index, Middle, Ring, Pinky

${isCloud ? 'WiFiClientSecure espClient;' : 'WiFiClient espClient;'}
PubSubClient mqtt(espClient);
Servo armServo;
Servo fingerServos[5];

void handleCommand(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.print("JSON parse error: ");
    Serial.println(err.c_str());
    return;
  }

  const char* action = doc["action"] | "";
  Serial.print("Received action: ");
  Serial.println(action);

  if (doc.containsKey("ledState")) {
    bool ledOn = doc["ledState"];
    digitalWrite(PIN_LED, ledOn ? HIGH : LOW);
  }

  if (doc.containsKey("armAngle")) {
    int angle = constrain((int)doc["armAngle"], 0, 180);
    armServo.write(angle);
  }

  if (doc.containsKey("motorSpeed")) {
    int speedPct = constrain((int)doc["motorSpeed"], 0, 100);
    int pwm = map(speedPct, 0, 100, 0, 255);
    analogWrite(PIN_MOTOR_PWM, pwm);
  }

  if (doc.containsKey("servoAngles")) {
    JsonArray angles = doc["servoAngles"];
    for (int i = 0; i < 5 && i < angles.size(); i++) {
      int deg = constrain((int)angles[i], 0, 180);
      fingerServos[i].write(deg);
    }
  }

  if (strcmp(action, "reset") == 0) {
    digitalWrite(PIN_LED, LOW);
    analogWrite(PIN_MOTOR_PWM, 0);
    armServo.write(90);
    for (int i = 0; i < 5; i++) fingerServos[i].write(30);
  }

  // Acknowledge execution back to JisrBot Dashboard
  StaticJsonDocument<192> ack;
  ack["status"] = "executed";
  ack["action"] = action;
  char out[192];
  serializeJson(ack, out);
  mqtt.publish(TOPIC_STATUS, out);
}

void reconnectMqtt() {
  while (!mqtt.connected()) {
    String clientId = "JisrBot-ESP32-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    Serial.print("Connecting to MQTT...");
${
  isCloud
    ? '    bool ok = mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);'
    : '    bool ok = mqtt.connect(clientId.c_str());'
}
    if (ok) {
      Serial.println("Connected!");
      mqtt.subscribe(TOPIC_CMD);
      mqtt.publish(TOPIC_STATUS, "{\\"status\\":\\"online\\"}");
    } else {
      Serial.print("Failed rc=");
      Serial.println(mqtt.state());
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_MOTOR_PWM, OUTPUT);

  armServo.attach(PIN_ARM_SERVO);
  armServo.write(90);
  for (int i = 0; i < 5; i++) {
    fingerServos[i].attach(FINGER_PINS[i]);
    fingerServos[i].write(30);
  }

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\nWiFi connected.");

${isCloud ? '  espClient.setInsecure(); // Use root CA cert in production' : ''}
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(handleCommand);
}

void loop() {
  if (!mqtt.connected()) {
    reconnectMqtt();
  }
  mqtt.loop();
}
`;
}
