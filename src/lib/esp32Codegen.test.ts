import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MQTT_CONFIG,
  applyCommandToRobotState,
  buildRobotCommandPayload,
  generateEsp32Sketch,
  getCommandTopic,
  validateMqttConfig,
} from './esp32Codegen';

test('validateMqttConfig accepts public broker with secret topic and rejects loopback hosts', () => {
  const valid = validateMqttConfig(DEFAULT_MQTT_CONFIG);
  assert.equal(valid.ok, true);

  const local = validateMqttConfig({ ...DEFAULT_MQTT_CONFIG, brokerHost: '127.0.0.1' });
  assert.equal(local.ok, false);

  const cloudMissingAuth = validateMqttConfig({
    mode: 'hivemq_cloud',
    brokerHost: 'cluster123.s1.eu.hivemq.cloud',
    port: 8883,
    topicPrefix: 'my_secret_topic',
  });
  assert.equal(cloudMissingAuth.ok, false);
});

test('buildRobotCommandPayload clamps actuator bounds and attaches servo angles for signs', () => {
  const cmd = buildRobotCommandPayload({
    action: 'perform_sign',
    armAngle: 240,
    motorSpeed: -10,
    signGesture: 'hello',
  });
  assert.equal(cmd.armAngle, 180);
  assert.equal(cmd.motorSpeed, 0);
  assert.equal(cmd.signGesture, 'HELLO');
  assert.deepEqual(cmd.servoAngles, [0, 0, 0, 0, 0]);
});

test('applyCommandToRobotState updates state and resets cleanly', () => {
  const initial = {
    ledOn: false,
    armAngle: 90,
    motorSpeed: 0,
    activeSign: 'REST' as const,
    servoAngles: [25, 30, 35, 40, 45] as [number, number, number, number, number],
    lastUpdated: '',
  };

  const cmd = buildRobotCommandPayload({
    action: 'set_led',
    ledState: true,
    armAngle: 135,
  });
  const updated = applyCommandToRobotState(initial, cmd);
  assert.equal(updated.ledOn, true);
  assert.equal(updated.armAngle, 135);

  const reset = applyCommandToRobotState(updated, buildRobotCommandPayload({ action: 'reset' }));
  assert.equal(reset.ledOn, false);
  assert.equal(reset.armAngle, 90);
  assert.equal(reset.activeSign, 'REST');
});

test('generateEsp32Sketch embeds TLS client for HiveMQ Cloud and topic prefix', () => {
  const sketch = generateEsp32Sketch({
    mode: 'hivemq_cloud',
    brokerHost: 'demo.s1.eu.hivemq.cloud',
    port: 8883,
    useTls: true,
    topicPrefix: 'suez_secret_99',
    username: 'esp_user',
    password: 'secret',
  });
  assert.equal(sketch.includes('WiFiClientSecure espClient;'), true);
  assert.equal(sketch.includes(getCommandTopic('suez_secret_99')), true);
  assert.equal(sketch.includes('esp_user'), true);
});
