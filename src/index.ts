import { Env, TelegramUpdate, TelegramUser, TelegramChat, UserProfilePhotos } from './types';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 1. Webhook Security Ingress
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TG_WEBHOOK_SECRET) {
      return new Response('Unauthorized', { status: 403 });
    }
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    try {
      const update: TelegramUpdate = await request.json();

      if (update.message) {
        // Offload processing to background to maintain edge latency and prevent API retries
        ctx.waitUntil(processIntelligenceRequest(update.message, env));
      }

      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Execution Error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};

/**
 * Orchestrates the extraction, deep-fetching, and reporting pipeline.
 */
async function processIntelligenceRequest(message: any, env: Env): Promise<void> {
  const chatId = message.chat.id;
  let targetId: number | string | null = null;
  let targetUser: TelegramUser | null = null;
  let hiddenUserName: string | null = null;

  // --- Step 1: Target Acquisition Routing ---
  
  // A. Forwarded Message Analysis
  if (message.forward_origin) {
    if (message.forward_origin.type === 'user' && message.forward_origin.sender_user) {
      targetUser = message.forward_origin.sender_user;
      targetId = targetUser.id;
    } else if (message.forward_origin.type === 'hidden_user') {
      hiddenUserName = message.forward_origin.sender_user_name;
    }
  } else if (message.forward_from) { // Legacy API handling
    targetUser = message.forward_from;
    targetId = targetUser.id;
  } 
  // B. Reply Analysis
  else if (message.reply_to_message?.from) {
    targetUser = message.reply_to_message.from;
    targetId = targetUser.id;
  } 
  // C. Direct Input Analysis (ID or @username)
  else if (message.text) {
    const text = message.text.trim();
    if (text.startsWith('@')) {
      targetId = text; // Telegram allows resolving @usernames directly via getChat
    } else if (/^\d{5,}$/.test(text)) {
      targetId = parseInt(text, 10);
    } else {
      // Fallback: Analyze the sender
      targetUser = message.from;
      targetId = targetUser?.id || null;
    }
  } else {
    // Ultimate Fallback: Analyze the sender
    targetUser = message.from;
    targetId = targetUser?.id || null;
  }

  // --- Step 2: Privacy Shield Handling ---
  if (hiddenUserName) {
    const text = `🛡️ <b>Privacy Shield Active</b>\n\nThis user has restricted their account details from forwarded messages.\n<b>Known Name:</b> <i>${escapeHTML(hiddenUserName)}</i>`;
    await sendTelegramRequest('sendMessage', env.TG_BOT_TOKEN, { chat_id: chatId, text, parse_mode: 'HTML' });
    return;
  }

  if (!targetId) {
    await sendTelegramRequest('sendMessage', env.TG_BOT_TOKEN, { chat_id: chatId, text: '❌ Could not acquire target data.' });
    return;
  }

  // --- Step 3: Deep Data Enrichment ---
  const [chatData, photoData] = await Promise.all([
    fetchTelegramAPI<TelegramChat>('getChat', env.TG_BOT_TOKEN, { chat_id: targetId }),
    typeof targetId === 'number' 
      ? fetchTelegramAPI<UserProfilePhotos>('getUserProfilePhotos', env.TG_BOT_TOKEN, { user_id: targetId, limit: 1 })
      : Promise.resolve(null)
  ]);

  // Aggregate knowledge base
  const finalUser = targetUser || (chatData ? {
    id: chatData.id,
    is_bot: false, // getChat doesn't return is_bot natively, assume false if unverified
    first_name: chatData.first_name || 'Unknown',
    last_name: chatData.last_name,
    username: chatData.username
  } as TelegramUser : null);

  if (!finalUser) {
    await sendTelegramRequest('sendMessage', env.TG_BOT_TOKEN, { chat_id: chatId, text: '❌ Target resolution failed. The bot may not have access to this user.' });
    return;
  }

  // --- Step 4: UI/UX Layout Construction (HTML Parse Mode) ---
  const permanentLink = `tg://user?id=${finalUser.id}`;
  const fullName = escapeHTML(`${finalUser.first_name} ${finalUser.last_name || ''}`.trim());
  
  let dossier = `<b>🗃️ INTELLIGENCE DOSSIER</b>\n`;
  dossier += `━━━━━━━━━━━━━━━━━━\n`;
  dossier += `👤 <b>Target:</b> <a href="${permanentLink}">${fullName}</a>\n`;
  dossier += `🆔 <b>ID:</b> <code>${finalUser.id}</code>\n`;
  
  if (finalUser.username || chatData?.username) {
    dossier += `🔗 <b>Username:</b> @${escapeHTML(finalUser.username || chatData?.username || '')}\n`;
  }
  
  if (chatData?.bio) {
    dossier += `📝 <b>Bio:</b> <i>${escapeHTML(chatData.bio)}</i>\n`;
  }

  dossier += `\n<b>📊 Telemetry</b>\n`;
  dossier += `🌐 <b>Language Code:</b> ${finalUser.language_code || '<i>Hidden</i>'}\n`;
  dossier += `💎 <b>Premium:</b> ${finalUser.is_premium ? 'Verified ✅' : 'No ❌'}\n`;
  dossier += `🤖 <b>Automation:</b> ${finalUser.is_bot ? 'Bot' : 'Human'}\n`;
  dossier += `━━━━━━━━━━━━━━━━━━`;

  // --- Step 5: Final Delivery ---
  // If a profile photo exists, render the dossier as an image caption.
  if (photoData && photoData.total_count > 0 && photoData.photos[0].length > 0) {
    // Select the highest resolution photo from the array
    const bestPhoto = photoData.photos[0][photoData.photos[0].length - 1].file_id;
    await sendTelegramRequest('sendPhoto', env.TG_BOT_TOKEN, { 
      chat_id: chatId, 
      photo: bestPhoto, 
      caption: dossier, 
      parse_mode: 'HTML' 
    });
  } else {
    // Send standard text layout
    await sendTelegramRequest('sendMessage', env.TG_BOT_TOKEN, { 
      chat_id: chatId, 
      text: dossier, 
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true } 
    });
  }
}

/**
 * Universal interface for calling Telegram Bot API methods with strictly parsed results.
 */
async function fetchTelegramAPI<T>(method: string, token: string, payload: any): Promise<T | null> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data: any = await response.json();
    return data.ok ? data.result : null;
  } catch (e) {
    console.error(`Telegram API Error (${method}):`, e);
    return null;
  }
}

/**
 * Fire-and-forget helper for outbound actions.
 */
async function sendTelegramRequest(method: string, token: string, payload: any): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

/**
 * Strips HTML-sensitive characters to prevent Parse Mode injection failures.
 */
function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
