import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function detectMessageLanguage(text: string, fallbackLang: 'ru' | 'kz' = 'ru'): 'ru' | 'kz' {
  if (!text || !text.trim()) return fallbackLang;
  const trimmed = text.trim();

  // Definitive Kazakh Cyrillic characters
  if (/[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/.test(trimmed)) {
    return 'kz';
  }

  const q = trimmed.toLowerCase();

  // Kazakh words written with standard Cyrillic or Latin transliteration
  const kzKeywords = [
    'қазақ', 'қазақша', 'казакша', 'казак', 'қалай', 'калай', 'қандай', 'кандай',
    'неге', 'неше', 'жұмыс', 'жумыс', 'жққ', 'шрк', 'діріл', 'дирил',
    'жабдық', 'жабдык', 'қауіп', 'кауип', 'қызметкер', 'кызметкер', 'маман',
    'жүйе', 'жуйе', 'қосу', 'косу', 'өшіру', 'оширу', 'сәлем', 'салем',
    'рахмет', 'туралы', 'болады', 'істейді', 'истейди', 'мәлімет', 'малимет',
    'нұсқау', 'нускау', 'ескерту', 'хабарлама', 'кеңес', 'кенес', 'бар ма',
    'керек', 'көмек', 'комек', 'агрегатты', 'камераны', 'датчикті', 'шығарынды',
  ];
  if (kzKeywords.some((kw) => q.includes(kw))) {
    return 'kz';
  }

  // Russian-specific indicators
  const ruKeywords = [
    'как ', 'что ', 'почему', 'где ', 'какие', 'какой', 'сколько', 'можно',
    'нужно', 'расскажи', 'объясни', 'подключить', 'добавить', 'удалить',
    'ошибка', 'работает', 'нарушение', 'сотрудник', 'специалист', 'рабочий',
    'уведомлен', 'сиз', 'пдк', 'вибрац', 'оборудован', 'привет', 'помоги',
    'здравствуй', 'спасибо', 'пожалуйста', 'покажи', 'каск', 'жилет', 'датчик',
  ];
  if (/[ыэъёЫЭЪЁ]/.test(trimmed) || ruKeywords.some((kw) => q.includes(kw))) {
    return 'ru';
  }

  return fallbackLang;
}

function sanitizePlainText(text: string): string {
  return text
    // Unwrap fenced code blocks without backticks
    .replace(/```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g, '$1')
    // Remove inline code backticks
    .replace(/`([^`]*)`/g, '$1')
    // Convert markdown links [label](url) -> label (url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    // Remove markdown headings (#, ##, ###, etc.)
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, '$1')
    // Remove horizontal rules (---, ***, ___)
    .replace(/(^|\n)\s*([-*_]){3,}\s*(?=\n|$)/g, '$1')
    // Remove blockquote markers
    .replace(/(^|\n)\s*>\s?/g, '$1')
    // Convert asterisk list items to plain hyphen bullets
    .replace(/(^|\n)\s*\*\s+/g, '$1- ')
    // Remove bold/italic asterisks & strikethrough
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/~~(.*?)~~/gs, '$1')
    .replace(/\*/g, '')
    // Remove markdown underline emphasis (__word__ and standalone _word_) while keeping snake_case
    .replace(/__(.*?)__/gs, '$1')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, '$1$2')
    // Normalize excessive blank lines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function startServer() {
  const app = express();
  const portArgIdx = process.argv.indexOf('--port');
  const cliPort = portArgIdx !== -1 ? Number(process.argv[portArgIdx + 1]) : NaN;
  const PORT = !Number.isNaN(cliPort) && cliPort > 0 ? cliPort : Number(process.env.DEFAULT_APP_PORT) || 3000;

  app.use(express.json());

  // Chatbot endpoint: Proxies requests to Gemini / OpenRouter / Domain AI Engine
  app.post('/api/chat', async (req: Request, res: Response) => {
    try {
      const { messages, language = 'ru' } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Messages array is required' });
      }

      const normalizedMessages = messages
        .map((m: { sender?: string; role?: string; text?: string; content?: string }) => {
          const rawRole = (m.sender || m.role || 'user').toLowerCase();
          const role = rawRole === 'user' ? ('user' as const) : ('model' as const);
          const text = String(m.text ?? m.content ?? '').trim();
          return { role, text };
        })
        .filter((m) => m.text.length > 0);

      if (normalizedMessages.length === 0) {
        return res.status(400).json({ error: 'At least one non-empty message is required' });
      }

      const lastUserMsg =
        [...normalizedMessages].reverse().find((m) => m.role === 'user')?.text ||
        normalizedMessages[normalizedMessages.length - 1].text;

      const uiFallbackLang: 'ru' | 'kz' = language === 'kz' ? 'kz' : 'ru';
      const effectiveLang = detectMessageLanguage(lastUserMsg, uiFallbackLang);

      const openRouterKey = process.env.OPENROUTER_API_KEY;
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;

      const systemPrompt =
        effectiveLang === 'kz'
          ? `Сіз — NeuroFactory AI өнеркәсіптік жасанды интеллект платформасының бас инженер-кеңесшісісіз.
Қазақстанның ауыр өнеркәсіп кәсіпорындарына (металлургия, мұнай-газ, тау-кен, химия) арналған шешімдерге жауаптысыз.
Сіздің мамандануыңыз:
1. SafeVision: ЖҚҚ (жеке қорғаныс құралдары: қорғаныс дулығасы, сигналдық кеудеше, қорғаныс көзілдірігі) сақталуын бақылау, қауіпті аймақтарға рұқсатсыз кіруді анықтау, камераларды IP-мекенжай мен QR-код арқылы қосу/өшіру және қызметкерлер мен мамандарға бұзушылық хабарламаларын жіберу.
2. EcoPredict: Газ талдағыштарды (CO, NO2, SO2, PM2.5, PM10) IP/QR арқылы қосу/өшіру, ҚР экологиялық нормалары (ШРК — шекті рұқсат етілген концентрация) және залпты шығарындыларды LSTM моделімен алдын ала болжау.
3. FailPredict: Жабдықтардың (турбокомпрессорлар, сорғылар, престер) діріл үдеуі (ISO 10816-3 бойынша RMS мм/с) мен подшипник температурасын талдау, істен шығуға дейінгі қалдық ресурс (RUL) және ТҚ жөндеуге наряд-рұқсаттама қалыптастыру.
ҚАТАҢ ЕРЕЖЕЛЕР:
1. Тек таза, сауатты ҚАЗАҚ ТІЛІНДЕ жауап беріңіз (барлық техникалық терминдер мен түсіндірмелерді қазақша жазыңыз; халықаралық белгілерді мысалы ISO 10816-3, SO2, CO, NO2, PM2.5, RMS, RUL, IP, QR сол күйінде қалдырып, мағынасын қазақша түсіндіріңіз).
2. Жауапта ЕШҚАШАН жұлдызша (*, **), хэштег (#, ##, ###), кері тырнақша (\`), астын сызу (_, __), тильда (~~) немесе кез келген Markdown белгілеуін қолданбаңыз.
3. Тек таза мәтін, қарапайым нөмірленген тізім (1., 2., 3.) және кәдімгі сызықша (-) қолданыңыз.`
          : `Вы — главный инженер-консультант промышленной платформы искусственного интеллекта NeuroFactory AI.
Вы отвечаете за индустриальные решения для тяжелой промышленности Казахстана и СНГ (металлургия, нефтехимия, горная добыча, машиностроение).
Ваша специализация:
1. SafeVision: Нейросетевой контроль СИЗ (каски, сигнальные жилеты, защитные очки), предотвращение входа в опасные зоны, подключение/удаление камер по IP-адресу и QR-коду, учет нарушений сотрудников и мгновенные уведомления специалистам.
2. EcoPredict: Экологический мониторинг газов (CO, NO2, SO2, PM2.5, PM10), подключение/удаление эко-датчиков по IP и QR, нормативы ПДК по стандартам Республики Казахстан и прогноз залповых выбросов (LSTM).
3. FailPredict: Вибродиагностика агрегатов (турбокомпрессоры, насосы, клети) по стандарту ISO 10816-3 (RMS вибрация мм/с, температура подшипников), расчет остаточного ресурса RUL и оформление нарядов-допусков на ТО.
СТРОГИЕ ПРАВИЛА:
1. Отвечайте строго на РУССКОМ ЯЗЫКЕ, включая все технические термины, единицы измерения и пояснения (международные аббревиатуры вроде ISO 10816-3, SO2, CO, NO2, PM2.5, RMS, RUL, IP, QR, RTSP поясняйте по-русски).
2. НИКОГДА не используйте в ответе звездочки (*, **), решетки заголовков (#, ##, ###), обратные кавычки (\`), подчеркивания (_, __), тильды (~~) или любую другую Markdown-разметку.
3. Пишите только чистым текстом, используя обычную нумерацию (1., 2., 3.) и тире (-).`;

      // Ensure Gemini contents start with a 'user' turn and alternate cleanly
      const firstUserIdx = normalizedMessages.findIndex((m) => m.role === 'user');
      const geminiSource = firstUserIdx >= 0 ? normalizedMessages.slice(firstUserIdx) : normalizedMessages;
      const geminiContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
      for (const msg of geminiSource) {
        const last = geminiContents[geminiContents.length - 1];
        if (last && last.role === msg.role) {
          last.parts[0].text += `\n${msg.text}`;
        } else {
          geminiContents.push({ role: msg.role, parts: [{ text: msg.text }] });
        }
      }

      // If Gemini API key is configured, invoke official @google/genai
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (geminiApiKey && geminiApiKey.trim() !== '') {
        try {
          const ai = new GoogleGenAI({
            apiKey: geminiApiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: geminiContents,
            config: {
              systemInstruction: systemPrompt,
            },
          });

          const reply = response.text;
          if (reply) {
            return res.json({
              reply: sanitizePlainText(reply),
              detectedLanguage: effectiveLang,
            });
          }
        } catch (geminiErr) {
          console.error('Error invoking Gemini API:', geminiErr);
        }
      }

      // If OpenRouter API key is configured, invoke OpenRouter
      if (openRouterKey && openRouterKey.trim() !== '') {
        try {
          const apiPayload = {
            model: 'meta-llama/llama-3.3-70b-instruct',
            messages: [
              { role: 'system', content: systemPrompt },
              ...geminiSource.map((m) => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.text,
              })),
            ],
            temperature: 0.3,
            max_tokens: 1000,
          };

          const openRouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openRouterKey}`,
              'HTTP-Referer': appUrl,
              'X-Title': 'NeuroFactory AI Platform',
            },
            body: JSON.stringify(apiPayload),
          });

          if (openRouterRes.ok) {
            const data = await openRouterRes.json();
            const reply = data.choices?.[0]?.message?.content;
            if (reply) {
              return res.json({
                reply: sanitizePlainText(reply),
                detectedLanguage: effectiveLang,
              });
            }
          } else {
            console.warn('OpenRouter API returned non-200 status:', openRouterRes.status);
          }
        } catch (openRouterErr) {
          console.error('Error invoking OpenRouter API:', openRouterErr);
        }
      }

      // Intelligent Industrial AI Domain Knowledge Engine fallback
      const reply = generateDomainAIResponse(lastUserMsg, effectiveLang);
      return res.json({
        reply: sanitizePlainText(reply),
        detectedLanguage: effectiveLang,
      });
    } catch (err: unknown) {
      console.error('Chat endpoint error:', err);
      res.status(500).json({ error: 'Internal server error processing chat request' });
    }
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'nominal',
      service: 'NeuroFactory Industrial Core',
      timestamp: new Date().toISOString(),
    });
  });

  // Serve static build in production, or mount Vite middleware in development
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NeuroFactory AI full-stack server running at http://0.0.0.0:${PORT}`);
  });
}

/**
 * Domain-specific industrial AI logic engine for NeuroFactory
 */
function generateDomainAIResponse(question: string, language: 'ru' | 'kz'): string {
  const q = question.toLowerCase();

  if (language === 'kz') {
    if (
      q.includes('safevision') ||
      q.includes('жққ') ||
      q.includes('дулыға') ||
      q.includes('каск') ||
      q.includes('көзілдірік') ||
      q.includes('аймақ') ||
      q.includes('камера')
    ) {
      return `SafeVision модулі бойынша инженерлік түсініктеме:
1. ЖҚҚ анықтау: Жүйе YOLOv11 Edge нейрожелісі арқылы бейнеағынды секундына 25 кадрға дейінгі жылдамдықпен талдап, қорғаныс дулығасын, сигналдық кеудешені және қорғаныс көзілдірігін 94.2% дәлдікпен анықтайды.
2. Қорғаныс көзілдірігі: Шлифовка және дәнекерлеу бекеттерінде бет аймағын сегментациялау арқылы қорғаныс көзілдірігінің бар-жоғы нақты уақытта тексеріледі.
3. Қауіпті аймақтар: Кран жүру жолдары мен балқыту аймақтарына персонал кірген сәтте 0.3 секунд ішінде дабыл беріліп, цех мамандарына бірден хабарлама жолданады.
4. Камераларды басқару: SafeVision бөлімінде камераларды IP-мекенжай (RTSP) немесе QR-код арқылы қосуға және қажет емес камераларды өшіруге болады.`;
    }

    if (
      q.includes('ecopredict') ||
      q.includes('шрк') ||
      q.includes('пдк') ||
      q.includes('so2') ||
      q.includes('co') ||
      q.includes('no2') ||
      q.includes('pm2') ||
      q.includes('шығарынды') ||
      q.includes('экология') ||
      q.includes('газ')
    ) {
      return `EcoPredict экологиялық мониторинг модулі бойынша мәлімет:
1. ҚР заңнамасы бойынша ШРК (шекті рұқсат етілген концентрация) нормативтері:
   - SO2 (Күкірт диоксиді): бір реттік максималды ШРК — 0.5 мг/м3, тәуліктік орташа норма — 0.05 мг/м3.
   - CO (Көміртек оксиді): ШРК — 5.0 мг/м3 (тәуліктік орташа — 3.0 мг/м3).
   - NO2 (Азот диоксиді): ШРК — 0.2 мг/м3.
   - PM2.5 / PM10 (Ұсақ дисперсті шаң): 0.15 мг/м3 аспауы тиіс.
2. LSTM болжау моделі: Ауа райы параметрлерін (жел жылдамдығы, температуралық инверсия) және пеш жүктемесін талдап, залпты шығарындыларды 24 сағат бұрын алдын ала болжайды.
3. Датчиктерді қосу: Эко-сенсорларды (Modbus TCP / MQTT) IP-мекенжай немесе QR-код арқылы жүйеге қосуға және тізімнен өшіруге болады.`;
    }

    if (
      q.includes('failpredict') ||
      q.includes('діріл') ||
      q.includes('дирил') ||
      q.includes('вибрац') ||
      q.includes('ақау') ||
      q.includes('компрессор') ||
      q.includes('rul') ||
      q.includes('наряд') ||
      q.includes('өтінім') ||
      q.includes('жабдық')
    ) {
      return `FailPredict вибродиагностика және қалдық ресурс (RUL) талдауы:
1. ISO 10816-3 стандарты бойынша діріл жылдамдығы (RMS, мм/с):
   - 2.3 мм/с дейін (А аймағы): Қалыпты, мінсіз күй.
   - 2.3 – 4.5 мм/с (В аймағы): Қанағаттанарлық күй, шектеусіз жұмыс істеуге болады.
   - 4.5 – 7.1 мм/с (С аймағы): Ескерту деңгейі, подшипник ақауы немесе теңгерімсіздік дамуда (жоспарлы тексеру қажет).
   - 7.1 мм/с жоғары (D аймағы): Сыни деңгей, сыну қаупі жоғары — агрегатты шұғыл тоқтату ұсынылады.
2. 6.8 мм/с діріл кезінде және 78% ақау қаупінде: FailPredict бөлімінде агрегат картасын ашып, ТҚ-ға наряд-рұқсаттама қалыптастыру батырмасын басыңыз. Инженерге подшипниктерді тексеру және майлау жөніндегі тапсырма бірден жіберіледі.`;
    }

    if (
      q.includes('қызметкер') ||
      q.includes('жұмысшы') ||
      q.includes('маман') ||
      q.includes('құпия') ||
      q.includes('парол') ||
      q.includes('пошта') ||
      q.includes('профил')
    ) {
      return `Кәсіпорын профилінде қызметкерлерді басқару тәртібі:
1. Қызметкер қосу: Зауыт профилінің Қызметкерлер бөлімінде мамандығын көрсетіп тіркеңіз. Электрондық пошта мен құпия сөз автоматты түрде жасалады және барлық қызметкерлерге көрінеді.
2. Қарапайым жұмысшы (worker): Басқару немесе жабдықты өшіру құқығы болмайды, тек өзіне тіркелген ЖҚҚ бұзушылықтарын көре алады.
3. Маман (specialist): Барлық модульдерге толық қолжетімділік алады және бұзушылық тіркелген сәтте жедел хабарлама алады.`;
    }

    return `NeuroFactory AI жүйесінің жауабы:
Платформа ауыр өнеркәсіп кәсіпорындарында 3 негізгі бағытта жұмыс істейді:
1. SafeVision: Бейнеаналитика арқылы ЖҚҚ (дулыға, кеудеше, көзілдірік) сақталуын және қауіпті аймақтарды бақылау. Камераларды IP-мекенжай және QR-код арқылы қосуға немесе өшіруге болады.
2. EcoPredict: Зиянды газдар мен шаң концентрациясын бақылау, ҚР ШРК нормалары бойынша 24 сағаттық болжау.
3. FailPredict: ISO 10816-3 бойынша агрегаттардың дірілі мен температурасын бақылау, RUL ресурсын есептеу және жөндеуге наряд-рұқсаттама беру.
Қай модуль немесе техникалық параметр бойынша нақты кеңес қажет екенін қазақша немесе орысша нақтылаңыз.`;
  }

  // Russian response (plain text, zero markdown)
  if (
    q.includes('safevision') ||
    q.includes('каск') ||
    q.includes('жилет') ||
    q.includes('очки') ||
    q.includes('сиз') ||
    q.includes('зон') ||
    q.includes('камер')
  ) {
    return `Инженерная справка по модулю SafeVision:
1. Контроль СИЗ: Используется модель YOLOv11 Edge с инференсом до 25 FPS на камеру. Распознаются защитные каски, сигнальные жилеты со светоотражающими полосами и поликарбонатные очки (точность детекции до 94.2%).
2. Защитные очки: На участках шлифовки и сварки нейросеть выполняет сегментацию области лица и фиксирует отсутствие очков как инцидент СИЗ.
3. Опасные зоны: Периметр кран-балок и плавильных печей задается полигональными масками. При пересечении границы тревога срабатывает за 0.3 секунды, а специалисты цеха сразу получают уведомление.
4. Подключение и удаление камер: Новые камеры добавляются по IP-адресу (RTSP) или через QR-код, а неактуальные потоки можно удалить прямо из списка камер.`;
  }

  if (
    q.includes('ecopredict') ||
    q.includes('пдк') ||
    q.includes('so2') ||
    q.includes('co') ||
    q.includes('no2') ||
    q.includes('pm2') ||
    q.includes('выброс') ||
    q.includes('эколог') ||
    q.includes('газ')
  ) {
    return `Инженерная справка по модулю EcoPredict:
1. Нормативы ПДК (Республика Казахстан):
   - SO2 (диоксид серы): максимальная разовая ПДК — 0.5 мг/м3, среднесуточная — 0.05 мг/м3.
   - CO (оксид углерода): ПДК м.р. — 5.0 мг/м3, среднесуточная — 3.0 мг/м3.
   - NO2 (диоксид азота): ПДК м.р. — 0.2 мг/м3.
   - Пыль мелкодисперсная (PM2.5 / PM10): предел — 0.15 мг/м3.
2. Предиктивный алгоритм: Модели временных рядов LSTM прогнозируют рост концентраций на 24 часа вперед с учетом скорости ветра и загрузки печей.
3. Управление датчиками: Газоанализаторы подключаются по IP-адресу (Modbus TCP / MQTT) или через QR-код и могут быть удалены в панели ростера датчиков.`;
  }

  if (
    q.includes('failpredict') ||
    q.includes('вибраци') ||
    q.includes('rul') ||
    q.includes('компрессор') ||
    q.includes('подшипник') ||
    q.includes('наряд') ||
    q.includes('риск') ||
    q.includes('агрегат')
  ) {
    return `Инженерная справка по модулю FailPredict:
1. Стандарт вибрации ISO 10816-3 (RMS, мм/с):
   - До 2.3 мм/с (Зона A): Отличное состояние агрегата.
   - 2.3 – 4.5 мм/с (Зона B): Допустимая длительная эксплуатация без ограничений.
   - 4.5 – 7.1 мм/с (Зона C): Предупреждение — развитие дефекта подшипника или дисбаланса крыльчатки, требуется плановое ТО.
   - Выше 7.1 мм/с (Зона D): Критический уровень — высокий риск заклинивания, необходим немедленный останов.
2. Вибрация 6.8 мм/с и риск отказа 78%: Узел находится в верхней части зоны C. Нажмите кнопку формирования наряда-допуска в карточке агрегата, чтобы передать задачу дежурному механику на проверку подшипников и центровку вала.`;
  }

  if (
    q.includes('сотрудник') ||
    q.includes('рабоч') ||
    q.includes('специалист') ||
    q.includes('парол') ||
    q.includes('почт') ||
    q.includes('профил')
  ) {
    return `Управление персоналом в профиле предприятия:
1. Регистрация по специальности: В профиле завода укажите ФИО, специальность и роль. Email и пароль генерируются автоматически и сразу доступны для просмотра и копирования.
2. Обычный рабочий (worker): Не имеет прав на подключение или удаление оборудования и модерацию событий; видит только свои зафиксированные нарушения СИЗ.
3. Специалист (specialist): Имеет полный доступ ко всем модулям и получает мгновенные уведомления при фиксации любых нарушений.`;
  }

  return `Ответ аналитического центра NeuroFactory AI:
Платформа обеспечивает сквозной промышленный мониторинг по 3 основным модулям:
1. SafeVision: Детекция СИЗ (каски, жилеты, очки) и контроль опасных зон с подключением и удалением камер по IP и QR-коду.
2. EcoPredict: Контроль ПДК газов (SO2, CO, NO2, PM2.5) и прогнозирование выбросов на 24 часа.
3. FailPredict: Вибродиагностика оборудования по ISO 10816-3, расчет остаточного ресурса RUL и оформление нарядов-допусков.
Задайте уточняющий вопрос на русском или казахском языке.`;
}

startServer();
