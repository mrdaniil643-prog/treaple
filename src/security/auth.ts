import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Config } from '../config.js';
import type { Logger } from '../logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: Buffer;
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Защита вебхука. Поддерживаются два способа, оба через общий секрет:
 *  1) подпись тела: HMAC-SHA256(raw body) в заголовке WEBHOOK_SIGNATURE_HEADER (hex);
 *  2) простой токен в заголовке WEBHOOK_TOKEN_HEADER — если AIUI Studio
 *     умеет слать только статический заголовок.
 * Если WEBHOOK_SECRET не задан, проверка отключена (только для локальной отладки).
 */
export function createAuthMiddleware(config: Config, logger: Logger) {
  const secret = config.WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('WEBHOOK_SECRET не задан: вебхук открыт всем, не выкатывайте так в прод');
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const token = req.header(config.WEBHOOK_TOKEN_HEADER);
    if (token && safeEqual(token, secret)) return next();

    const signature = req.header(config.WEBHOOK_SIGNATURE_HEADER);
    if (signature && req.rawBody) {
      const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
      const provided = signature.replace(/^sha256=/i, '');
      if (safeEqual(provided, expected)) return next();
    }

    logger.warn('Отклонён неавторизованный запрос к вебхуку', { path: req.path });
    res.status(401).json({ code: 401, message: 'unauthorized' });
  };
}
