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
  sender_user_name?: string; // Present if type is 'hidden_user'
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  username?: string;
  first_name?: string;
  last_name?: string;
  bio?: string; // Available via getChat
  description?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  forward_origin?: MessageOrigin;
  forward_from?: TelegramUser; // Legacy fallback
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
