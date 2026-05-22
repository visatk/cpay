import { Env, TelegramUpdate, TelegramUser, TelegramChat, UserProfilePhotos, InlineKeyboardMarkup } from './types';
import { TelegramAPI } from './telegram';

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		// Enforce strict ingress security
		if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TG_WEBHOOK_SECRET) {
			return new Response('Unauthorized', { status: 403 });
		}
		if (request.method !== 'POST') {
			return new Response('Method Not Allowed', { status: 405 });
		}

		try {
			const update: TelegramUpdate = await request.json();

			if (update.message) {
				// Non-blocking background execution. Instantly free the isolate thread.
				ctx.waitUntil(handleUpdate(update.message, env));
			}

			// Immediately acknowledge webhook to prevent Telegram retry loops
			return new Response('OK', { status: 200 });
		} catch (error) {
			console.error('Core Execution Error:', error);
			return new Response('Internal Server Error', { status: 500 });
		}
	},
};

async function handleUpdate(message: any, env: Env): Promise<void> {
	const tg = new TelegramAPI(env.TG_BOT_TOKEN);
	const chatId = message.chat.id;

	// Command Routing
	if (message.text?.startsWith('/start')) {
		const welcomeText = `🛡️ **CYBERLINK Bot Online**\n\nSubmit a target for analysis:\n1. Forward a message from the target\n2. Reply to a target's message\n3. Send a Telegram User ID (e.g., \`123456789\`)\n4. Send a Username (e.g., \`@username\`)`;
		await tg.call('sendMessage', { chat_id: chatId, text: welcomeText, parse_mode: 'Markdown' });
		return;
	}

	// UX: Indicate processing status immediately
	await tg.sendAction(chatId, 'typing');

	const targetData = extractTarget(message);

	// Handle Privacy Restricted Users
	if (targetData.hiddenUserName) {
		const text = `⚠️ <b>Privacy Shield Detected</b>\n\nTarget has restricted message forwarding visibility.\n<b>Known Alias:</b> <i>${escapeHTML(targetData.hiddenUserName)}</i>`;
		await tg.call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
		return;
	}

	if (!targetData.id) {
		await tg.call('sendMessage', { chat_id: chatId, text: '❌ <b>Target Acquisition Failed.</b> Provide a valid forward, reply, ID, or @username.', parse_mode: 'HTML' });
		return;
	}

	// Parallel Data Deep-Fetch
	const [chatData, photoData] = await Promise.all([
		tg.call<TelegramChat>('getChat', { chat_id: targetData.id }),
		typeof targetData.id === 'number'
			? tg.call<UserProfilePhotos>('getUserProfilePhotos', { user_id: targetData.id, limit: 1 })
			: Promise.resolve(null),
	]);

	const userRef = targetData.user || (chatData ? mapChatToUser(chatData) : null);

	if (!userRef || !chatData) {
		await tg.call('sendMessage', { chat_id: chatId, text: `❌ <b>Resolution Failed.</b> Target \`${targetData.id}\` not found or bot lacks access.`, parse_mode: 'HTML' });
		return;
	}

	// Build the interactive dossier
	await deliverDossier(tg, chatId, userRef, chatData, photoData);
}

/**
 * Extracts target data utilizing a fallback cascade strategy.
 */
function extractTarget(message: any): { id: number | string | null; user: TelegramUser | null; hiddenUserName: string | null } {
	if (message.forward_origin) {
		if (message.forward_origin.type === 'user' && message.forward_origin.sender_user) {
			return { id: message.forward_origin.sender_user.id, user: message.forward_origin.sender_user, hiddenUserName: null };
		}
		if (message.forward_origin.type === 'hidden_user') {
			return { id: null, user: null, hiddenUserName: message.forward_origin.sender_user_name };
		}
	}
	if (message.reply_to_message?.from) {
		return { id: message.reply_to_message.from.id, user: message.reply_to_message.from, hiddenUserName: null };
	}
	if (message.text) {
		const text = message.text.trim();
		if (text.startsWith('@')) return { id: text, user: null, hiddenUserName: null };
		if (/^\d{5,}$/.test(text)) return { id: parseInt(text, 10), user: null, hiddenUserName: null };
	}
	return { id: message.from?.id || null, user: message.from || null, hiddenUserName: null };
}

/**
 * Constructs and dispatches the final UI payload.
 */
async function deliverDossier(tg: TelegramAPI, chatId: number, user: TelegramUser, chatData: TelegramChat, photoData: UserProfilePhotos | null): Promise<void> {
	const fullName = escapeHTML(`${user.first_name} ${user.last_name || ''}`.trim());
	const permanentLink = `tg://user?id=${chatData.id}`;
	
	let html = `<b>🗃️ TARGET:</b>\n`;
	html += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
	html += `<b>[ IDENTIFICATION ]</b>\n`;
	html += `👤 <b>Name:</b> <a href="${permanentLink}">${fullName}</a>\n`;
	html += `🆔 <b>UID:</b> <code>${chatData.id}</code>\n`;
	
	if (chatData.username) html += `🔗 <b>Primary Alias:</b> @${escapeHTML(chatData.username)}\n`;
	
	if (chatData.active_usernames && chatData.active_usernames.length > 1) {
		html += `🏷️ <b>Other Aliases:</b> ${chatData.active_usernames.filter(u => u !== chatData.username).map(u => `@${escapeHTML(u)}`).join(', ')}\n`;
	}

	html += `\n<b>[ METADATA ]</b>\n`;
	if (chatData.bio) html += `📝 <b>Bio:</b> <i>${escapeHTML(chatData.bio)}</i>\n`;
	html += `🌐 <b>Language:</b> ${user.language_code || '<i>Unknown</i>'}\n`;
	html += `💎 <b>Premium Status:</b> ${user.is_premium ? 'Verified ✅' : 'Standard ❌'}\n`;
	html += `🤖 <b>Entity Type:</b> ${user.is_bot ? 'Automated Service (Bot)' : 'Human'}\n`;
	
	// Deep Privacy Flags (Available in newer Bot API versions)
	if (chatData.has_private_forwards) html += `🛡️ <b>Forward Privacy:</b> Active\n`;
	if (chatData.has_restricted_voice_and_video_messages) html += `🎙️ <b>Voice/Video Restrictions:</b> Active\n`;
	
	html += `━━━━━━━━━━━━━━━━━━━━━━━━`;

	const keyboard: InlineKeyboardMarkup = {
		inline_keyboard: [[
			{ text: '🔗 Share Intelligence', switch_inline_query: `ID: ${chatData.id}` },
			{ text: '🌐 View Profile', url: `tg://openmessage?user_id=${chatData.id}` }
		]]
	};

	const payload = {
		chat_id: chatId,
		parse_mode: 'HTML',
		reply_markup: keyboard
	};

	if (photoData && photoData.total_count > 0 && photoData.photos[0].length > 0) {
		const bestPhoto = photoData.photos[0][photoData.photos[0].length - 1].file_id;
		await tg.sendAction(chatId, 'upload_photo');
		await tg.call('sendPhoto', { ...payload, photo: bestPhoto, caption: html });
	} else {
		await tg.call('sendMessage', { ...payload, text: html, link_preview_options: { is_disabled: true } });
	}
}

function mapChatToUser(chat: TelegramChat): TelegramUser {
	return {
		id: chat.id,
		is_bot: false,
		first_name: chat.first_name || 'Unknown',
		last_name: chat.last_name,
		username: chat.username
	};
}

function escapeHTML(str: string): string {
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
