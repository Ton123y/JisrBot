import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mqtt, { type MqttClient } from 'mqtt';
import { GoogleGenAI, ThinkingLevel, Type, type FunctionDeclaration } from '@google/genai';
import {
  DEFAULT_MQTT_CONFIG,
  applyCommandToRobotState,
  buildRobotCommandPayload,
  getCommandTopic,
  getStatusTopic,
  validateMqttConfig,
  type MqttConfig,
  type RobotCommandPayload,
  type RobotState,
} from './src/lib/esp32Codegen.ts';
import {
  SIGN_LEXICON,
  SIGN_LIST,
  normalizeSignSequence,
  textToSignSequence,
  translateSentenceToSignSteps,
  type SignId,
} from './src/lib/signLanguage.ts';
import { EGYPTIAN_SIGN_DATASET_PROMPT } from './src/lib/egyptianSignDataset.ts';
import { prepareMarkdownForSignTranslation } from './src/lib/attachments.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

interface CommandLogEntry {
  command: RobotCommandPayload;
  publishedToBroker: boolean;
  topic: string;
  source: 'ai' | 'manual' | 'sign_camera' | 'system';
}

// --- Server-Side Robot & MQTT Bridge State ---
const envMqttAttempt = validateMqttConfig({
  mode: 'public',
  brokerHost: process.env.MQTT_DEFAULT_BROKER || DEFAULT_MQTT_CONFIG.brokerHost,
  port: DEFAULT_MQTT_CONFIG.port,
  useTls: false,
  topicPrefix: process.env.MQTT_DEFAULT_TOPIC_PREFIX || DEFAULT_MQTT_CONFIG.topicPrefix,
});

let activeConfig: MqttConfig = envMqttAttempt.ok
  ? envMqttAttempt.config
  : { ...DEFAULT_MQTT_CONFIG };

let mqttClient: MqttClient | null = null;
let mqttState: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
let mqttLastError = '';

let robotState: RobotState = {
  ledOn: false,
  armAngle: 90,
  motorSpeed: 0,
  activeSign: 'REST',
  servoAngles: [...SIGN_LEXICON.REST.servoTargets] as [number, number, number, number, number],
  lastUpdated: new Date().toISOString(),
};

const commandHistory: CommandLogEntry[] = [];

function recordCommand(entry: CommandLogEntry) {
  commandHistory.unshift(entry);
  if (commandHistory.length > 30) {
    commandHistory.pop();
  }
}

function getSanitizedConfig() {
  return {
    mode: activeConfig.mode,
    brokerHost: activeConfig.brokerHost,
    port: activeConfig.port,
    useTls: activeConfig.useTls,
    topicPrefix: activeConfig.topicPrefix,
    username: activeConfig.username || '',
    hasPassword: Boolean(activeConfig.password),
    commandTopic: getCommandTopic(activeConfig.topicPrefix),
    statusTopic: getStatusTopic(activeConfig.topicPrefix),
  };
}

function connectMqttBroker(config: MqttConfig): Promise<{ connected: boolean; error?: string }> {
  return new Promise((resolve) => {
    if (mqttClient) {
      try {
        mqttClient.end(true);
      } catch {
        // ignore cleanup errors
      }
      mqttClient = null;
    }

    activeConfig = config;
    mqttState = 'connecting';
    mqttLastError = '';

    const protocol = config.useTls ? 'mqtts' : 'mqtt';
    const url = `${protocol}://${config.brokerHost}:${config.port}`;
    const client = mqtt.connect(url, {
      clientId: `jisrbot_hub_${Math.random().toString(16).slice(2, 10)}`,
      username: config.username || undefined,
      password: config.password || undefined,
      connectTimeout: 5500,
      reconnectPeriod: 15000,
      clean: true,
    });

    mqttClient = client;
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        if (mqttState === 'connecting') {
          mqttState = 'error';
          mqttLastError = 'انتهت مهلة الاتصال بسيرفر MQTT. تأكد من الإنترنت أو إعدادات السيرفر.';
        }
        resolve({ connected: false, error: mqttLastError });
      }
    }, 6000);

    client.on('connect', () => {
      mqttState = 'connected';
      mqttLastError = '';
      client.subscribe(getStatusTopic(config.topicPrefix), () => {});
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ connected: true });
      }
    });

    client.on('message', (topic, message) => {
      if (topic === getStatusTopic(config.topicPrefix)) {
        try {
          const parsed = JSON.parse(message.toString());
          if (typeof parsed.ledState === 'boolean') robotState.ledOn = parsed.ledState;
          if (typeof parsed.armAngle === 'number') robotState.armAngle = parsed.armAngle;
          if (typeof parsed.motorSpeed === 'number') robotState.motorSpeed = parsed.motorSpeed;
          robotState.lastUpdated = new Date().toISOString();
        } catch {
          // ignore non-json telemetry
        }
      }
    });

    client.on('error', (err) => {
      mqttState = 'error';
      mqttLastError = err.message || 'تعذر الاتصال بسيرفر MQTT';
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ connected: false, error: mqttLastError });
      }
    });

    client.on('offline', () => {
      if (mqttState === 'connected') {
        mqttState = 'disconnected';
      }
    });
  });
}

function dispatchRobotCommand(
  cmd: RobotCommandPayload,
  source: CommandLogEntry['source']
): { publishedToBroker: boolean; topic: string } {
  robotState = applyCommandToRobotState(robotState, cmd);
  const topic = getCommandTopic(activeConfig.topicPrefix);
  let publishedToBroker = false;

  if (mqttClient && mqttClient.connected) {
    try {
      mqttClient.publish(topic, JSON.stringify(cmd), { qos: 0 });
      publishedToBroker = true;
    } catch {
      publishedToBroker = false;
    }
  }

  recordCommand({
    command: cmd,
    publishedToBroker,
    topic,
    source,
  });

  return { publishedToBroker, topic };
}

function getAiClient(apiVersion?: string): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('مفتاح GEMINI_API_KEY غير مهيأ في الخادم. يرجى إضافته في إعدادات البيئة.');
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|overloaded|high demand|fetch failed/i.test(msg);
}

function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/503|UNAVAILABLE|high demand/i.test(raw)) {
    return 'خادم الذكاء الاصطناعي مزدحم مؤقتاً. حاول مرة أخرى خلال لحظات.';
  }
  if (/API_KEY_INVALID|403|PERMISSION_DENIED/i.test(raw)) {
    return 'يرجى التحقق من صلاحية مفتاح Gemini API في إعدادات الأسرار.';
  }
  if (/429|RESOURCE_EXHAUSTED/i.test(raw)) {
    return 'تم تجاوز حد الطلبات المؤقت. انتظر قليلاً ثم أعد المحاولة.';
  }
  return 'تعذر إتمام الطلب مع الذكاء الاصطناعي حالياً.';
}

async function withGeminiRetry<T>(
  fn: (modelName: string) => Promise<T>,
  primaryModel = 'gemini-4-hydrogen',
  fallbackModel?: string
): Promise<T> {
  const { result } = await withGeminiRetryMeta(fn, primaryModel, fallbackModel);
  return result;
}

async function withGeminiRetryMeta<T>(
  fn: (modelName: string) => Promise<T>,
  primaryModel = 'gemini-4-hydrogen',
  fallbackModel?: string
): Promise<{ result: T; modelUsed: string }> {
  const delays = [500];
  let lastErr: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const result = await fn(primaryModel);
      return { result, modelUsed: primaryModel };
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err) || attempt === delays.length) {
        break;
      }
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }

  if (fallbackModel && fallbackModel !== primaryModel && isTransientError(lastErr)) {
    try {
      const result = await fn(fallbackModel);
      return { result, modelUsed: fallbackModel };
    } catch (fbErr) {
      if (!isTransientError(fbErr)) throw fbErr;
      await new Promise((r) => setTimeout(r, 750));
      const result = await fn(fallbackModel);
      return { result, modelUsed: fallbackModel };
    }
  }
  throw lastErr;
}

const VALID_SIGN_IDS = SIGN_LIST.map((s) => s.id).join(', ');

const SYSTEM_INSTRUCTION = `أنت "JisrBot" (جسر بوت)، مساعد ذكاء اصطناعي ذكي وودود بيتكلم **باللهجة المصرية الطبيعية والواضحة** زي أي شخص مصري مثقف ولبق، وبتجمع قدرات الفهم والتحليل العميق على غرار Gemini وClaude، ومتصل مباشرة بروبوت حقيقي (ESP32) عبر الإنترنت.

أسلوب كلامك وقواعدك الأساسية:
1. **اللهجة المصرية**: رد دايماً باللهجة المصرية السهلة والواضحة (زي: "أهلاً بيك!", "تمام جداً"، "بص يا سيدي"، "حاضر هعملك ده حالاً") سواء في الدردشة العادية أو لما ترد على كلام جاي من لغة الإشارة أو لما تأكد تنفيذ أوامر الروبوت. لو المستخدم سأل سؤال بالإنجليزي أو طلب الفصحى صراحةً، جاوبه باللغة اللي طلبها، لكن الأساس في العربي هو **اللهجة المصرية**.
2. **الأسئلة العامة والتقنية**: جاوب على أي سؤال في البرمجة، العلوم، الرياضيات، الكتابة، الشرح، الترجمة، أو التلخيص بإجابات دقيقة ومنظمة بصيغة Markdown (عناوين واضحة، نقاط، أمثلة، ومقاطع كود عند الحاجة) مع شرح مصري سلس وبسيط.
3. **تحليل الملفات والصور**: اقرا محتوى ملفات PDF أو الأكواد أو الجداول النصية أو الصور المرفقة أو المصوّرة بالكاميرا بدقة، وجاوب عن تفاصيلها الحقيقية باللهجة المصرية.
4. **التحكم في الروبوت ESP32**: لو المستخدم طلب تحريك الروبوت أو تنفيذ أمر مادي (تشغيل/إطفاء النور LED، رفع أو تحريك الذراع، تشغيل الموتور، التلويح أو عمل إشارة باليد، أو إعادة الضبط لوضع الراحة)، استدعِ أداة "control_robot_hardware" فوراً بالقيم المناسبة، وبعدين أكّدله التنفيذ باللهجة المصرية. الأسئلة العامة وتحليل الملفات والصور متستدعيش فيها أدوات الروبوت.
حالة الروبوت دلوقتي: LED={{LED}}, ArmAngle={{ARM}}°.`;

const controlRobotTool: FunctionDeclaration = {
  name: 'control_robot_hardware',
  description:
    'Send a real-time hardware command to the connected ESP32 robot over MQTT (LED, arm angle servo, DC motor speed, 5-finger sign gesture, or reset).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      action: {
        type: Type.STRING,
        description: 'One of: set_led, set_arm_angle, set_motor_speed, perform_sign, reset',
      },
      ledState: {
        type: Type.BOOLEAN,
        description: 'True to turn LED/light ON, false to turn OFF.',
      },
      armAngle: {
        type: Type.NUMBER,
        description: 'Wrist/arm servo angle in degrees from 0 to 180 (90 is neutral, 150 is raised).',
      },
      motorSpeed: {
        type: Type.NUMBER,
        description: 'Motor PWM speed percentage from 0 to 100.',
      },
      signGesture: {
        type: Type.STRING,
        description: `Optional SignId for the 5-finger robotic hand: ${VALID_SIGN_IDS}`,
      },
      note: {
        type: Type.STRING,
        description: 'Brief Arabic or English description of the command.',
      },
    },
    required: ['action'],
  },
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  // Connect default public MQTT broker asynchronously in background (non-blocking)
  connectMqttBroker(activeConfig).catch(() => {});

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      mqttState,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.get('/api/mqtt/status', (_req, res) => {
    res.json({
      config: getSanitizedConfig(),
      connectionState: mqttState,
      lastError: mqttLastError,
      robotState,
      commandHistory,
    });
  });

  app.post('/api/mqtt/config', async (req, res) => {
    const validated = validateMqttConfig(req.body ?? {});
    if (!validated.ok) {
      res.status(400).json({ ok: false, error: validated.error });
      return;
    }

    const result = await connectMqttBroker(validated.config);
    if (result.connected) {
      const pingCmd = buildRobotCommandPayload({
        action: 'ping',
        note: 'اتصال وتجربة قناة ESP32 بنجاح',
      });
      dispatchRobotCommand(pingCmd, 'system');
    }

    res.json({
      ok: true,
      connected: result.connected,
      error: result.error || '',
      config: getSanitizedConfig(),
      connectionState: mqttState,
      robotState,
      commandHistory,
    });
  });

  app.post('/api/mqtt/publish', (req, res) => {
    const body = req.body ?? {};
    const allowedActions = ['set_led', 'set_arm_angle', 'set_motor_speed', 'perform_sign', 'reset', 'ping'];
    if (!allowedActions.includes(body.action)) {
      res.status(400).json({ ok: false, error: 'نوع الأمر غير مدعوم.' });
      return;
    }

    const cmd = buildRobotCommandPayload({
      action: body.action,
      ledState: typeof body.ledState === 'boolean' ? body.ledState : undefined,
      armAngle: typeof body.armAngle === 'number' ? body.armAngle : undefined,
      motorSpeed: typeof body.motorSpeed === 'number' ? body.motorSpeed : undefined,
      signGesture: typeof body.signGesture === 'string' ? body.signGesture : undefined,
      note: typeof body.note === 'string' ? body.note.slice(0, 120) : undefined,
    });

    const dispatch = dispatchRobotCommand(cmd, body.source === 'sign_camera' ? 'sign_camera' : 'manual');
    res.json({
      ok: true,
      publishedToBroker: dispatch.publishedToBroker,
      topic: dispatch.topic,
      command: cmd,
      robotState,
      commandHistory,
    });
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const rawMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 4) : [];

      const userParts: Array<Record<string, unknown>> = [];
      for (const att of rawAttachments) {
        if (!att || typeof att !== 'object') continue;
        const name = typeof att.name === 'string' ? att.name.slice(0, 120) : 'attachment';
        const kind = att.kind;
        const mimeType = typeof att.mimeType === 'string' ? att.mimeType.split(';')[0].trim() : '';
        const data = typeof att.data === 'string' ? att.data : '';
        if (!data) continue;

        if (kind === 'image' && /^image\/(jpeg|jpg|png|webp|gif)$/i.test(mimeType)) {
          userParts.push({
            inlineData: { mimeType, data },
          });
        } else if (kind === 'pdf' && mimeType === 'application/pdf') {
          userParts.push({
            inlineData: { mimeType: 'application/pdf', data },
          });
        } else if (kind === 'text') {
          const clippedText = data.slice(0, 60000);
          userParts.push({
            text: `--- محتوى الملف المرفق (${name}) ---\n${clippedText}\n--- نهاية الملف ---`,
          });
        }
      }

      if (!rawMessage && userParts.length === 0) {
        res.status(400).json({ error: 'من فضلك اكتب رسالة، أو ابعت صوت، أو أرفق ملف أو صورة.' });
        return;
      }

      const isFromSign = Boolean(req.body?.isFromSign);
      const effectivePrompt = rawMessage || 'حلل المرفقات دي واشرح محتواها بوضوح وبالتفصيل.';
      if (isFromSign) {
        userParts.push({
          text: `[رسالة مجمّعة من المستخدم بلغة الإشارة — افهم المعنى الكامل لكل الجمل المتجمعة ورد عليه باللهجة المصرية الودودة والواضحة]:\n${effectivePrompt}`,
        });
      } else {
        userParts.push({ text: effectivePrompt });
      }

      const rawHistory = Array.isArray(req.body?.history) ? req.body.history.slice(-10) : [];
      const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];
      for (const item of rawHistory) {
        if (item && (item.role === 'user' || item.role === 'model') && typeof item.text === 'string' && item.text.trim()) {
          // Ensure Gemini contents never begin with a 'model' role turn and alternate cleanly
          if (contents.length === 0 && item.role === 'model') continue;
          const prev = contents[contents.length - 1];
          if (prev && prev.role === item.role) {
            prev.parts.push({ text: item.text.trim() });
          } else {
            contents.push({
              role: item.role,
              parts: [{ text: item.text.trim() }],
            });
          }
        }
      }
      const lastTurn = contents[contents.length - 1];
      if (lastTurn && lastTurn.role === 'user') {
        lastTurn.parts.push(...userParts);
      } else {
        contents.push({
          role: 'user',
          parts: userParts,
        });
      }

      const ai = getAiClient();
      const tools = [{ functionDeclarations: [controlRobotTool] }];
      const systemText = SYSTEM_INSTRUCTION
        .replace('{{LED}}', robotState.ledOn ? 'ON' : 'OFF')
        .replace('{{ARM}}', String(robotState.armAngle));

      const executedCommands: CommandLogEntry[] = [];
      let chosenSigns: SignId[] | null = null;
      let replyText = '';

      let currentContents = [...contents];
      let chatLoopError: unknown = null;
      let stepPrimaryModel = 'gemini-4-hydrogen';
      try {
        for (let step = 0; step < 3; step++) {
          const { result: response, modelUsed } = await withGeminiRetryMeta(
            (modelName) =>
              ai.models.generateContent({
                model: modelName,
                contents: currentContents,
                config: {
                  systemInstruction: systemText,
                  tools,
                  ...(modelName === 'gemini-4-hydrogen'
                    ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                    : {}),
                },
              }),
            stepPrimaryModel,
            'gemini-3.1-flash-lite'
          );
          // Stick with whichever model succeeded if primary fell back
          stepPrimaryModel = modelUsed;

          const candidateContent = response.candidates?.[0]?.content;
          const calls = response.functionCalls;

          if (calls && calls.length > 0 && candidateContent) {
            currentContents.push(candidateContent as { role: 'user' | 'model'; parts: Array<Record<string, unknown>> });
            const responseParts: Array<Record<string, unknown>> = [];

            for (const call of calls) {
              const args = (call.args ?? {}) as Record<string, unknown>;
              if (call.name === 'control_robot_hardware') {
                const rawAction = String(args.action || 'perform_sign');
                const validAction = (['set_led', 'set_arm_angle', 'set_motor_speed', 'perform_sign', 'reset'].includes(
                  rawAction
                )
                  ? rawAction
                  : 'perform_sign') as RobotCommandPayload['action'];

                const cmd = buildRobotCommandPayload({
                  action: validAction,
                  ledState: typeof args.ledState === 'boolean' ? args.ledState : undefined,
                  armAngle: typeof args.armAngle === 'number' ? args.armAngle : undefined,
                  motorSpeed: typeof args.motorSpeed === 'number' ? args.motorSpeed : undefined,
                  signGesture: typeof args.signGesture === 'string' ? args.signGesture : undefined,
                  note: typeof args.note === 'string' ? args.note : undefined,
                });

                const dispatch = dispatchRobotCommand(cmd, 'ai');
                executedCommands.push({
                  command: cmd,
                  publishedToBroker: dispatch.publishedToBroker,
                  topic: dispatch.topic,
                  source: 'ai',
                });

                if (cmd.signGesture && !chosenSigns) {
                  chosenSigns = [cmd.signGesture];
                }

                responseParts.push({
                  functionResponse: {
                    id: call.id,
                    name: call.name,
                    response: {
                      ok: true,
                      publishedOverMqtt: dispatch.publishedToBroker,
                      topic: dispatch.topic,
                      robotState,
                    },
                  },
                });
              }
            }

            currentContents.push({
              role: 'user',
              parts: responseParts,
            });

            if (response.text && response.text.trim()) {
              replyText = response.text.trim();
            }
            continue;
          }

          if (response.text && response.text.trim()) {
            replyText = response.text.trim();
          }
          break;
        }
      } catch (loopErr) {
        chatLoopError = loopErr;
        if (executedCommands.length === 0) {
          throw loopErr;
        }
      }

      if (!replyText) {
        if (executedCommands.length > 0) {
          const summaries = executedCommands.map((e) => e.command.note || e.command.action).join('، ');
          replyText = `تمام! نفّذتلك أوامر الروبوت (${summaries}) وبعتها لـ ESP32.`;
        } else if (chatLoopError) {
          throw chatLoopError;
        } else {
          replyText = 'أهلاً بيك! أنا جاهز نتكلم في أي حاجة أو أنفذلك أوامر الروبوت.';
        }
      }

      const signReadyText = prepareMarkdownForSignTranslation(replyText);
      const signSteps = translateSentenceToSignSteps(signReadyText);
      const signSequence = chosenSigns ?? textToSignSequence(`${effectivePrompt} ${signReadyText}`);
      if (signSequence.length > 0) {
        robotState.activeSign = signSequence[0];
      }

      res.json({
        replyText,
        signSteps,
        signSequence,
        executedCommands,
        robotState,
        mqttState,
        commandHistory,
      });
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.error('[Chat fatal error]', rawMsg);
      res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  app.post('/api/ai/tts', async (req, res) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text) {
        res.status(400).json({ error: 'النص مطلوب لتحويله إلى صوت.' });
        return;
      }

      const voiceName = typeof req.body?.voiceName === 'string' ? req.body.voiceName : 'Kore';
      const ai = getAiClient('v1beta');
      const safeText = text.slice(0, 800);

      let response;
      try {
        response = await withGeminiRetry(
          (modelName) =>
            ai.models.generateContent({
              model: modelName,
              contents: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: safeText,
                      speechMetadata: {
                        style: 'Warm, friendly Egyptian Arabic assistant speaking naturally and clearly',
                      },
                    },
                  ],
                },
              ],
              config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName },
                  },
                },
              },
            }),
          'gemini-3.8-flash-lite-tts',
          'gemini-3.8-flash-tts'
        );
      } catch (primaryErr) {
        console.error('[TTS primary error]', primaryErr instanceof Error ? primaryErr.message : primaryErr);
        response = await withGeminiRetry(
          (modelName) =>
            ai.models.generateContent({
              model: modelName,
              contents: [{ role: 'user', parts: [{ text: safeText }] }],
              config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName },
                  },
                },
              },
            }),
          'gemini-3.8-flash-tts'
        );
      }

      const inlinePart = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const base64Audio = inlinePart?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'لم يتمكن محرك الصوت من توليد مقطع صوتي.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: inlinePart?.mimeType || 'audio/wav',
      });
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.error('[TTS fatal error]', rawMsg);
      res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  app.post('/api/ai/transcribe', async (req, res) => {
    try {
      const audioBase64 = typeof req.body?.audioBase64 === 'string' ? req.body.audioBase64 : '';
      const rawMime = typeof req.body?.mimeType === 'string' ? req.body.mimeType : 'audio/webm';
      const mimeType = rawMime.split(';')[0].trim() || 'audio/webm';
      if (!audioBase64) {
        res.status(400).json({ error: 'الملف الصوتي مفقود.' });
        return;
      }

      const aiBeta = getAiClient('v1beta');
      const aiDefault = getAiClient();
      let response;
      try {
        response = await withGeminiRetry(
          (modelName) =>
            aiBeta.models.generateContent({
              model: modelName,
              contents: {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: audioBase64,
                    },
                  },
                  {
                    text: 'Transcribe the spoken Arabic or English audio accurately. Return only the transcribed text without extra commentary.',
                  },
                ],
              },
            }),
          'gemini-3.5-transcribe',
          'gemini-4-hydrogen'
        );
      } catch (primaryErr) {
        console.error('[Transcribe primary error]', primaryErr instanceof Error ? primaryErr.message : primaryErr);
        response = await withGeminiRetry(
          (modelName) =>
            aiDefault.models.generateContent({
              model: modelName,
              contents: {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: audioBase64,
                    },
                  },
                  {
                    text: 'Transcribe the spoken Arabic or English audio accurately. Return only the transcribed text without extra commentary.',
                  },
                ],
              },
            }),
          'gemini-4-hydrogen',
          'gemini-3.1-flash-lite'
        );
      }

      const transcript = (response.text ?? '').trim();
      res.json({ transcript });
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.error('[Transcribe fatal error]', rawMsg);
      res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  app.post('/api/ai/recognize-sign', async (req, res) => {
    try {
      const imageBase64 = typeof req.body?.imageBase64 === 'string' ? req.body.imageBase64 : '';
      const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : 'image/jpeg';
      const mode = req.body?.mode === 'letters' ? 'letters' : 'gestures';
      const spatialContext =
        req.body?.spatialContext && typeof req.body.spatialContext === 'object'
          ? (req.body.spatialContext as {
              bodyDetected?: boolean;
              handsCount?: number;
              leftHandZone?: string;
              rightHandZone?: string;
              handsRelation?: string;
              locationSummaryAr?: string;
            })
          : null;
      if (!imageBase64) {
        res.status(400).json({ error: 'الصورة مطلوبة لتحليل لغة الإشارة.' });
        return;
      }

      const spatialHintText = spatialContext
        ? `LIVE BODY & TWO-HAND SPATIAL TELEMETRY (from MediaPipe Pose 33-point + Dual HandLandmarker):
- Body skeleton detected: ${Boolean(spatialContext.bodyDetected)}
- Visible hands count: ${spatialContext.handsCount ?? 'unknown'}
- Right hand body zone: ${spatialContext.rightHandZone || 'unknown'}
- Left hand body zone: ${spatialContext.leftHandZone || 'unknown'}
- Hands relation: ${spatialContext.handsRelation || 'unknown'}
- Summary: ${spatialContext.locationSummaryAr || ''}`
        : `Inspect the full upper body (head, face, eyes, mouth, shoulders, chest, torso) AND BOTH hands (left + right) and their spatial locations relative to the body.`;

      const modeFocusInstruction =
        mode === 'letters'
          ? `PRIORITY MODE = NAME FINGERSPELLING LETTERS ONLY (تهجئة الاسم بالحروف):
Focus on recognizing Arabic Sign Language fingerspelling letters (أ، ب، ت، ث، ج، ح، خ، د، ذ، ر، ز، س، ش، ص، ض، ط، ظ، ع، غ، ف، ق، ك، ل، م، ن، هـ، و، ي) OR ASL alphabet letters (A-Z) for spelling a name.
Set isLetter=true and set recognizedWordAr to ONLY that single letter (e.g. "أ", "ب", "ت", "س", "م", "A"). Also pick the closest SignId from ${VALID_SIGN_IDS} for 3D preview.`
          : `PRIORITY MODE = FULL GESTURES & COMPLETE EGYPTIAN/ARABIC SIGN WORDS ONLY (حركات وكلمات كاملة بدون حروف):
NEVER return an isolated single letter (never return "أ", "ب", "ل", "ن", "م", "A", etc.).
Prioritize matching against the 56-class Mendeley Egyptian Sign Language dataset (DOI: 10.17632/39tbt2jd7r.1) and core signs below, factoring in BOTH hands + body location:
${EGYPTIAN_SIGN_DATASET_PROMPT}
Core 3D SignIds: ${VALID_SIGN_IDS}.
Set isLetter=false and set recognizedWordAr to the cleanest matching Egyptian Arabic word/phrase (e.g. "عامل إيه", "صباح الخير", "تمام", "بحب", "عايز", "مش عايز", "دلوقتي", "كتاب", "بيت", "مفيش", "خلي بالك", "تعبان", "حلو أوي", "مرحباً", "نعم", "لا", "شكراً", "توقف", "مساعدة"). If matched to one of the 56 dataset classes, also set datasetClass to its slug (or "" if general).`;

      const ai = getAiClient();
      const response = await withGeminiRetry(
        (modelName) =>
          ai.models.generateContent({
            model: modelName,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: imageBase64,
                  },
                },
                {
                  text: `You are an expert Egyptian & Arabic Sign Language vision classifier grounded in full-body pose + dual-hand spatial context and the Mendeley Egyptian Sign Language dataset (10.17632/39tbt2jd7r.1).
Inspect the frame carefully:
1. Check BOTH hands (Left + Right) AND the upper body (head, face, mouth, shoulders, chest, torso):
   - If NO hand is visible, set handDetected=false, detectedSignId="NONE", confidence=0, isLetter=false, recognizedWordAr="", datasetClass="", spatialSummaryAr="لم يتم رصد اليدين", and briefly explain in Arabic.
   - If 1 or 2 hands ARE visible, set handDetected=true and confidence (0-100).
2. ${spatialHintText}
   Remember how body placement changes sign meaning in Egyptian Sign Language:
   - Near forehead/eyes -> صباح الخير / خلي بالك / فاطن
   - Near mouth/chin -> تمام / شكراً / حلو أوي / كداب / صادق
   - At chest/heart -> بحب / عايز / تعبان / أخويا / صاحبي
   - Two hands together at chest -> كتاب / بيت / عامل إيه
   - Two hands apart at chest -> مفيش / فكك مني
   - Neutral space -> مرحباً / توقف / نعم / لا / سؤال
3. ${modeFocusInstruction}
Set spatialSummaryAr to a short Arabic note describing where the hand(s) & body are positioned.`,
                },
              ],
            },
            config: {
              ...(modelName === 'gemini-4-hydrogen'
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  handDetected: { type: Type.BOOLEAN },
                  isLetter: { type: Type.BOOLEAN },
                  detectedSignId: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  recognizedWordAr: { type: Type.STRING },
                  datasetClass: { type: Type.STRING },
                  spatialSummaryAr: { type: Type.STRING },
                  arabicMeaning: { type: Type.STRING },
                  englishMeaning: { type: Type.STRING },
                  explanationAr: { type: Type.STRING },
                  suggestedResponseSigns: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: [
                  'handDetected',
                  'isLetter',
                  'detectedSignId',
                  'confidence',
                  'recognizedWordAr',
                  'datasetClass',
                  'spatialSummaryAr',
                  'arabicMeaning',
                  'englishMeaning',
                  'explanationAr',
                  'suggestedResponseSigns',
                ],
              },
            },
          }),
        'gemini-4-hydrogen',
        'gemini-3.1-flash-lite'
      );

      const raw = (response.text ?? '{}').trim();
      const parsed = JSON.parse(raw) as {
        handDetected?: boolean;
        isLetter?: boolean;
        detectedSignId?: string;
        confidence?: number;
        recognizedWordAr?: string;
        datasetClass?: string;
        spatialSummaryAr?: string;
        arabicMeaning?: string;
        englishMeaning?: string;
        explanationAr?: string;
        suggestedResponseSigns?: string[];
      };

      let rawConf = Number(parsed.confidence ?? 0);
      if (rawConf > 0 && rawConf <= 1) {
        rawConf = rawConf * 100;
      }
      const confidence = Math.max(0, Math.min(100, Math.round(rawConf)));
      const rawId = String(parsed.detectedSignId || '').trim().toUpperCase();
      const handDetected =
        parsed.handDetected !== false &&
        (Boolean(parsed.recognizedWordAr?.trim()) || (rawId !== '' && rawId !== 'NONE')) &&
        (confidence === 0 ? true : confidence >= 30);

      if (!handDetected) {
        res.json({
          handDetected: false,
          isLetter: false,
          detectedSignId: null,
          confidence,
          recognizedWordAr: '',
          datasetClass: '',
          spatialSummaryAr: parsed.spatialSummaryAr || spatialContext?.locationSummaryAr || '',
          arabicMeaning: parsed.arabicMeaning || 'لم يتم رصد يد واضحة',
          englishMeaning: parsed.englishMeaning || 'No clear hand detected',
          explanationAr:
            parsed.explanationAr ||
            'ضع يديك والجسم العلوي بوضوح أمام الكاميرا لالتقاط الحركات والموقع فوراً.',
          responseSigns: [] as SignId[],
        });
        return;
      }

      const normalized = normalizeSignSequence([parsed.detectedSignId || 'OPEN_HAND']);
      const detectedSignId: SignId = normalized[0];
      const responseSigns = normalizeSignSequence(parsed.suggestedResponseSigns);
      const fallbackWord = SIGN_LEXICON[detectedSignId].glossAr.split('/')[0].trim();
      const rawWord = (parsed.recognizedWordAr || '').trim();
      const recognizedWordAr =
        mode === 'letters'
          ? rawWord || fallbackWord
          : rawWord && rawWord.length > 1
          ? rawWord
          : fallbackWord;
      const isLetter = mode === 'letters' && (Boolean(parsed.isLetter) || recognizedWordAr.length === 1);

      res.json({
        handDetected: true,
        isLetter,
        detectedSignId,
        confidence,
        recognizedWordAr,
        datasetClass: (parsed.datasetClass || '').trim(),
        spatialSummaryAr:
          (parsed.spatialSummaryAr || '').trim() || spatialContext?.locationSummaryAr || '',
        arabicMeaning: parsed.arabicMeaning || SIGN_LEXICON[detectedSignId].glossAr,
        englishMeaning: parsed.englishMeaning || SIGN_LEXICON[detectedSignId].glossEn,
        explanationAr: parsed.explanationAr || SIGN_LEXICON[detectedSignId].descriptionAr,
        responseSigns,
      });
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.error('[RecognizeSign fatal error]', rawMsg);
      res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  app.post('/api/ai/compose-sign-sentence', async (req, res) => {
    try {
      const rawTokens = Array.isArray(req.body?.rawTokens)
        ? req.body.rawTokens.map((t: unknown) => String(t || '').trim()).filter(Boolean).slice(0, 30)
        : [];
      const rawDraft = typeof req.body?.rawDraft === 'string' ? req.body.rawDraft.trim() : '';
      const accumulatedContext =
        typeof req.body?.accumulatedContext === 'string' ? req.body.accumulatedContext.trim() : '';

      const combinedRaw = rawDraft || rawTokens.join(' ');
      if (!combinedRaw) {
        res.status(400).json({ error: 'مفيش إشارات أو كلمات حالياً لتكوين جملة.' });
        return;
      }

      const ai = getAiClient();
      const response = await withGeminiRetry(
        (modelName) =>
          ai.models.generateContent({
            model: modelName,
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    text: `أنت خبير في ترجمة لغة الإشارة المصرية والعربية وصياغتها باللهجة المصرية الطبيعية.
المستخدم عمل مجموعة إشارات كاملة باليدين والجسم عبر الكاميرا (استناداً لقاموس داتا سيت لغة الإشارة المصرية):
الإشارات الحالية: "${combinedRaw}"
${accumulatedContext ? `الجمل اللي المستخدم جمّعها قبل كده في نفس الرسالة (كمّل عليها بدون ما تكررها): "${accumulatedContext}"` : ''}

مرجع إشارات الداتا سيت المصرية لتفادي أي خطأ في فهم الكلمات:
${EGYPTIAN_SIGN_DATASET_PROMPT}

المطلوب:
كوّن جملة واحدة واضحة ومفهومة وطبيعية **باللهجة المصرية** تعبّر عن الإشارات الحالية فقط (من غير حشو أو تكرار للكلام اللي قبله).
أعد النتيجة JSON بالصيغة:
- sentenceAr: الجملة المصاغة باللهجة المصرية (تنتهي بنقطة أو علامة استفهام).
- intentAr: ملخص قصير جداً من كلمتين إلى 4 كلمات لقصد المستخدم.`,
                  },
                ],
              },
            ],
            config: {
              ...(modelName === 'gemini-4-hydrogen'
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  sentenceAr: { type: Type.STRING },
                  intentAr: { type: Type.STRING },
                },
                required: ['sentenceAr', 'intentAr'],
              },
            },
          }),
        'gemini-4-hydrogen',
        'gemini-3.1-flash-lite'
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        sentenceAr?: string;
        intentAr?: string;
      };
      const sentenceAr = (parsed.sentenceAr || combinedRaw).trim();
      const intentAr = (parsed.intentAr || 'جملة بلغة الإشارة').trim();
      res.json({ sentenceAr, intentAr });
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      console.error('[ComposeSignSentence error]', rawMsg);
      res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  // --- Vite Dev Middleware or Production Static Serving ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JisrBot server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
