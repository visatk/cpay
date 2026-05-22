export interface Env {
	TG_BOT_TOKEN: string;
	TG_WEBHOOK_SECRET: string;
}

export interface TelegramUser {
	id: number;
	is_bot: boolean;
	first_name: string;
	last_name?: string;
	username?: string;
	language_code?: string;
	is_premium?: boolean;
}

export interface MessageOrigin {
	type: 'user' | 'hidden_user' | 'chat' | 'channel';
	date: number;
	sender_user?: TelegramUser;
	sender_user_name?: string;
}

export interface TelegramChat {
	id: number;
	type: 'private' | 'group' | 'supergroup' | 'channel';
	username?: string;
	first_name?: string;
	last_name?: string;
	bio?: string;
	active_usernames?: string[];
	has_private_forwards?: boolean;
	has_restricted_voice_and_video_messages?: boolean;
}

export interface TelegramMessage {
	message_id: number;
	from?: TelegramUser;
	chat: TelegramChat;
	text?: string;
	forward_origin?: MessageOrigin;
	forward_from?: TelegramUser;
	reply_to_message?: TelegramMessage;
}

export interface TelegramUpdate {
	update_id: number;
	message?: TelegramMessage;
}

export interface UserProfilePhotos {
	total_count: number;
	photos: Array<Array<{ file_id: string; unique_id: string; width: number; height: number }>>;
}

export interface InlineKeyboardMarkup {
	inline_keyboard: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
}
