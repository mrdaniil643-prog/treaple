/**
 * Telegram -> GitHub Actions adapter, for Cloudflare Workers.
 *
 * Telegram needs something that is always listening; the clipping itself
 * needs a CPU for half an hour. Those are different jobs, so this Worker
 * only takes the request, answers instantly, and hands the heavy work to
 * a GitHub Actions run, which reports back into the same chat.
 *
 * Required secrets (Workers dashboard -> Settings -> Variables):
 *   TELEGRAM_BOT_TOKEN  from @BotFather
 *   WEBHOOK_SECRET      any random string, also passed to setWebhook
 *   GITHUB_TOKEN        fine-grained PAT, Contents: read and write
 *   GITHUB_REPO         owner/repo
 *   ALLOWED_CHAT_IDS    comma separated; who may spend your Actions minutes
 */

const TELEGRAM_API = "https://api.telegram.org";
// The Bot API refuses to hand a bot any file above 20 MB.
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const HELP = [
  "Кидайте сюда ссылку на видео — пришлю нарезку вертикальных клипов.",
  "",
  "Ссылка: просто отправьте её сообщением.",
  "Видео файлом: до 20 МБ (ограничение Telegram для ботов).",
  "",
  "Настройки в том же сообщении, через пробел:",
  "  8        сколько клипов",
  "  ru       язык распознавания",
  "  medium   модель побольше, точнее и медленнее",
  "  blur     кадр целиком на размытом фоне вместо кропа",
  "",
  "Пример: https://youtu.be/... 8 ru medium",
].join("\n");

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("ok", { status: 200 });
    }
    // Telegram echoes the secret we registered with setWebhook. Without
    // this check anyone who learns the URL can spend your Actions minutes.
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return ok();
    }

    // Always answer 200: a non-200 makes Telegram redeliver the same
    // update in a loop. Problems are reported into the chat instead.
    try {
      await handleUpdate(update, env);
    } catch (err) {
      const chatId = update?.message?.chat?.id;
      if (chatId) await say(env, chatId, `Не получилось: ${err.message}`);
    }
    return ok();
  },
};

const ok = () => new Response("ok", { status: 200 });

async function handleUpdate(update, env) {
  const message = update.message ?? update.channel_post;
  if (!message) return;

  const chatId = String(message.chat.id);
  const allowed = (env.ALLOWED_CHAT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(chatId)) {
    await say(env, chatId, "Этот бот приватный.");
    return;
  }

  const text = (message.text ?? message.caption ?? "").trim();

  if (/^\/(start|help)\b/.test(text)) {
    await say(env, chatId, HELP);
    return;
  }

  const options = parseOptions(text);
  const url = extractUrl(text);
  const media = message.video ?? message.document ?? null;

  let payload;
  let acknowledgement;

  if (url) {
    payload = { url };
    acknowledgement = "Принял ссылку.";
  } else if (media) {
    if (media.mime_type && !media.mime_type.startsWith("video/")) {
      await say(env, chatId, "Это не видео. Пришлите видеофайл или ссылку.");
      return;
    }
    if ((media.file_size ?? 0) > MAX_FILE_BYTES) {
      const mb = Math.round(media.file_size / 1024 / 1024);
      await say(
        env,
        chatId,
        `Файл ${mb} МБ, а Telegram отдаёт ботам максимум 20 МБ. ` +
          `Залейте видео куда-нибудь и пришлите ссылку.`
      );
      return;
    }
    payload = { file_id: media.file_id };
    acknowledgement = "Принял файл.";
  } else {
    await say(env, chatId, HELP);
    return;
  }

  await dispatch(env, { ...payload, ...options, chat_id: chatId });

  const parts = [
    acknowledgement,
    `Клипов: ${options.count}, язык: ${options.language || "авто"}, модель: ${options.model}.`,
    "Займёт минут двадцать-тридцать, буду писать о ходе.",
  ];
  await say(env, chatId, parts.join("\n"));
}

const MODELS = ["tiny", "base", "small", "medium", "large-v3"];
const REFRAMES = ["smart", "center", "blur"];
const LANGUAGES = ["ru", "en", "uk", "kk", "de", "fr", "es", "it", "pl", "pt", "tr"];

/** Bare words alongside the link tune the run: "8 ru medium blur". */
export function parseOptions(text) {
  const options = { count: "6", language: "", model: "small", reframe: "smart" };

  // Drop URLs first so nothing inside one is read as a setting.
  for (const word of text.replace(/https?:\/\/\S+/g, " ").split(/\s+/)) {
    const lower = word.toLowerCase();
    if (/^\d{1,2}$/.test(lower)) {
      options.count = String(Math.min(20, Math.max(1, parseInt(lower, 10))));
    } else if (MODELS.includes(lower)) {
      options.model = lower;
    } else if (REFRAMES.includes(lower)) {
      options.reframe = lower;
    } else if (LANGUAGES.includes(lower)) {
      options.language = lower;
    }
  }
  return options;
}

export function extractUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

async function dispatch(env, clientPayload) {
  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "treaple-clipper",
      },
      body: JSON.stringify({ event_type: "clip", client_payload: clientPayload }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub ответил ${response.status}. ${detail.slice(0, 200)}`);
  }
}

async function say(env, chatId, text) {
  await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      link_preview_options: { is_disabled: true },
    }),
  });
}
