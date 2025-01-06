import { Update, Start, Ctx, On, Action } from 'nestjs-telegraf';
import { Context } from './interfaces/context.interface';
import { Markup } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { Message } from 'telegraf/typings/core/types/typegram';
import { AdminMessage } from './interfaces/admin.interface';

@Injectable()
@Update()
export class BotUpdate {
  private activeChats: Record<number, AdminMessage> = {};

  constructor(private configService: ConfigService) {}

  @Start()
  async startCommand(@Ctx() ctx: Context) {
    const adminId = this.configService.get<string>('telegram.adminId');
    const isAdmin = ctx.from.id.toString() === adminId;

    if (isAdmin) {
      await ctx.reply('Добро пожаловать, администратор!', 
        Markup.keyboard([
          ['📋 Показать активные чаты']
        ])
        .resize()
      );
      return;
    }

    await ctx.reply('Выберите действие:', 
      Markup.keyboard([
        ['❓ Как сделать заказ?', '📞 Сделать заказ или задать вопрос']
      ])
      .resize()
    );
    return;
  }

  @On('text')
  async handleMessage(@Ctx() ctx: Context) {
    const adminId = this.configService.get<string>('telegram.adminId');
    const message = ctx.message as Message.TextMessage;
    const text = message?.text || '';
    const isAdmin = ctx.from.id.toString() === adminId;

    if (isAdmin) {
      if (ctx.session.replyToUser) {
        const userId = ctx.session.replyToUser;
        await ctx.telegram.sendMessage(userId, text);
        await ctx.reply('Ответ отправлен пользователю');
        delete ctx.session.replyToUser;
        return;
      }

      if (text === '📋 Показать активные чаты') {
        return this.showActiveChats(ctx);
      }
      return this.handleAdminMessage(ctx);
    }

    if (text === '❓ Как сделать заказ?') {
      await ctx.reply(`Инструкция по оформлению заказа:

1. Доставка Яндекс
   - Укажите точный адрес доставки
   - ФИО получателя
   - Контактный телефон

2. СДЭК
   - Адрес ПВЗ или точный адрес доставки
   - ФИО получателя
   - Контактный телефон

3. Почта России
   - Полный почтовый адрес с индексом
   - ФИО получателя
   - Контактный телефон

Для оформления заказа нажмите кнопку "🛍 Сделать заказ" и предоставьте информацию следуя инструкции`);
      return;
    }

    if (text === '📞 Сделать заказ или задать вопрос') {
      return this.handleStartChat(ctx, 'order');
    }

    if (ctx.session.isWaitingForAdmin) {
      return this.forwardToAdmin(ctx);
    }
  }

  private async showActiveChats(ctx: Context) {
    const chats = Object.values(this.activeChats);
    
    if (chats.length === 0) {
      await ctx.reply('Нет активных чатов', 
        Markup.keyboard([
          ['📋 Показать активные чаты']
        ])
        .resize()
      );
      return;
    }

    try {
      for (const chat of chats) {
        const messageText = `
Тип: ${chat.type === 'question' ? '❓ Вопрос' : '🛍 Заказ'}
От пользователя: ${chat.userId}
Сообщение: ${chat.text}
`;
        await ctx.reply(messageText, {
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✍️ Ответить', `reply_${chat.userId}`),
              Markup.button.callback('❌ Закрыть чат', `close_${chat.userId}`)
            ]
          ])
        });
      }
    } catch (error) {
      console.error('Error showing chats:', error);
      await ctx.reply('Произошла ошибка при отображении чатов');
    }
  }

  private async handleStartChat(ctx: Context, type: 'question' | 'order') {
    ctx.session.type = type;
    ctx.session.isWaitingForAdmin = true;
    const message = type === 'question' ? 
      'Опишите ваш вопрос' : 
      'Опишите ваш заказ или вопрос';
    await ctx.reply(message);
  }

  private async forwardToAdmin(ctx: Context) {
    const adminId = this.configService.get<string>('telegram.adminId');
    const userId = ctx.from.id;
    const message = ctx.message as Message.TextMessage;
    
    const messageText = `
Новое ${ctx.session.type === 'question' ? 'обращение' : 'заказ'}
От: ${ctx.from.username || 'Пользователь'}
ID: ${userId}
Сообщение: ${message.text}
    `;
    
    this.activeChats[userId] = {
      userId,
      messageId: message.message_id,
      text: message.text,
      type: ctx.session.type
    };

    await ctx.telegram.sendMessage(adminId, messageText);
    await ctx.reply('Ваше сообщение отправлено. Ожидайте ответа администратора.');
  }

  @Action(/reply_(\d+)/)
  async handleReplyButton(@Ctx() ctx: Context) {
    const callbackQuery = ctx.callbackQuery as { data: string };
    const match = callbackQuery.data.match(/reply_(\d+)/);
    if (!match) return;

    const userId = match[1];
    const chat = this.activeChats[userId];
    if (!chat) {
      return ctx.reply('Чат не найден');
    }

    ctx.session.replyToUser = userId;
    await ctx.reply(`Введите сообщение для пользователя ${userId}. Все, что вы напишете, будет отправлено пользователю.`);
  }

  @Action(/close_(\d+)/)
  async handleCloseChat(@Ctx() ctx: Context) {
    const callbackQuery = ctx.callbackQuery as { data: string };
    const match = callbackQuery.data.match(/close_(\d+)/);
    if (!match) return;

    const userId = match[1];
    if (this.activeChats[userId]) {
      delete this.activeChats[userId];
      await ctx.reply(`Чат с пользователем ${userId} закрыт`);
      await ctx.telegram.sendMessage(userId, 'Администратор закрыл чат. Если у вас появятся новые вопросы, начните новый диалог.');
    }
  }

  private async handleAdminMessage(ctx: Context) {
    const message = ctx.message as Message.TextMessage;
    if (!message?.reply_to_message) {
      return;
    }

    const replyMsg = message.reply_to_message as Message.TextMessage;
    const match = replyMsg.text?.match(/ID: (\d+)/);
    if (!match) return;

    const userId = parseInt(match[1]);
    await ctx.telegram.sendMessage(userId, message.text);
    await ctx.reply('Ответ отправлен пользователю');
  }
} 