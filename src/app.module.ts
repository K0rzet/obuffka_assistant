import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { BotModule } from './bot/bot.module';
import configuration from './config/configuration';
import * as LocalSession from 'telegraf-session-local';

const sessions = new LocalSession({ 
  database: 'sessions.json',
  property: 'session',
  storage: LocalSession.storageMemory,
  format: {
    serialize: (obj: any) => JSON.stringify(obj),
    deserialize: (str: string) => JSON.parse(str),
  },
});

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
    }),
    TelegrafModule.forRootAsync({
      useFactory: () => ({
        token: process.env.TELEGRAM_TOKEN,
        middlewares: [sessions.middleware()],
      }),
    }),
    BotModule,
  ],
})
export class AppModule {}
