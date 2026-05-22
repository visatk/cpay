export class TelegramAPI {
	private readonly baseUrl: string;

	constructor(private token: string) {
		this.baseUrl = `https://api.telegram.org/bot${this.token}`;
	}

	async call<T>(method: string, payload: any): Promise<T | null> {
		try {
			const response = await fetch(`${this.baseUrl}/${method}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				console.error(`[Telegram API] HTTP ${response.status} on ${method}`);
				return null;
			}

			const data: any = await response.json();
			if (!data.ok) {
				console.error(`[Telegram API] Payload Error on ${method}:`, data.description);
				return null;
			}

			return data.result as T;
		} catch (error) {
			console.error(`[Telegram API] Network Error on ${method}:`, error);
			return null;
		}
	}

	async sendAction(chatId: number, action: 'typing' | 'upload_photo'): Promise<void> {
		await this.call('sendChatAction', { chat_id: chatId, action });
	}
}
