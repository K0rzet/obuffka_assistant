import { Context as TelegrafContext } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import { AdminSession } from './admin.interface';

export interface Context extends TelegrafContext<Update> {
  session: {
    type?: 'question' | 'order';
    isWaitingForAdmin?: boolean;
    messageId?: number;
    adminSession?: AdminSession;
    replyToUser?: string;
  }
} 