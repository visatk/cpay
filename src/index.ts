import { Env, TelegramUpdate, TelegramUser } from './types';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 1. Enforce Webhook Security
    // Verify the request originates strictly from Telegram's authorized servers
    const secretToken = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secretToken !== env.TG_WEBHOOK_SECRET) {
      return new Response('Unauthorized Access', { status: 403 });
    }

    // 2. Only process POST requests containing the Telegram payload
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      const update: TelegramUpdate = await request.json();

      // 3. Ensure the update contains a message and user data
      if (update.message && update.message.from) {
        const user: TelegramUser = update.message.from;
        const chatId = update.message.chat.id;

        // 4. Construct deep intelligence profile
        // tg://user?id= schemes force Telegram to open the user's profile natively, 
        // acting as a permanent link even if they change their @username.
        const permanentLink = `tg://user?id=${user.id}`;
        
        let profileReport = `🔍 **User Intelligence Profile**\n\n`;
        profileReport += `👤 **Name:** ${user.first_name} ${user.last_name || ''}\n`;
        profileReport += `🆔 **User ID:** \`${user.id}\`\n`;
        if (user.username) {
          profileReport += `🔗 **Username:** @${user.username}\n`;
        }
        profileReport += `🌐 **Language:** ${user.language_code || 'Unknown'}\n`;
        profileReport += `💎 **Premium Status:** ${user.is_premium ? 'Yes ✅' : 'No ❌'}\n`;
        profileReport += `🤖 **Is Bot:** ${user.is_bot ? 'Yes' : 'No'}\n\n`;
        profileReport += `📍 **Permanent Link:** [View Profile](${permanentLink})`;

        // 5. Asynchronously push response to Telegram API
        // Utilize ctx.waitUntil to prevent blocking the Cloudflare Worker response
        ctx.waitUntil(sendTelegramMessage(env.TG_BOT_TOKEN, chatId, profileReport));
      }

      // 6. Immediately acknowledge the webhook to prevent Telegram retry loops
      return new Response('OK', { status: 200 });

    } catch (error) {
      console.error('Failed to process Telegram update:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};

/**
 * Executes the outbound fetch request to the Telegram Bot API.
 */
async function sendTelegramMessage(botToken: string, chatId: number, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'Markdown'
  };

  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
