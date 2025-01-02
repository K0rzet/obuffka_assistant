export interface AdminMessage {
  userId: number;
  messageId: number;
  text: string;
  type: 'question' | 'order';
}

export interface AdminSession {
  activeChats: Record<number, AdminMessage>;
} 