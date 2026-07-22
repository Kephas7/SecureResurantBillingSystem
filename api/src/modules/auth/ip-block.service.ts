import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * SECURITY: IP-based blocking for credential stuffing
 * detection.
 *
 * Credential stuffing attacks often rotate through many
 * accounts to avoid per-account lockout thresholds. This
 * service tracks how many distinct accounts an IP has
 * triggered lockout against within a time window.
 * Exceeding the threshold blocks the IP entirely from
 * auth endpoints.
 *
 * Redis is used for storage so:
 *   - Counters expire automatically (no cleanup needed)
 *   - State survives API restarts
 *   - In a multi-instance deployment, blocking is shared
 *     across all instances
 *
 * (OWASP Credential Stuffing Prevention Cheat Sheet, 2024)
 */

const IP_LOCKOUT_TRIGGER_THRESHOLD = 3; // accounts locked
const IP_LOCKOUT_WINDOW_SECONDS = 600; // 10 minutes
const IP_BLOCK_DURATION_SECONDS = 1800; // 30 minutes

@Injectable()
export class IpBlockService {
  private readonly logger = new Logger(IpBlockService.name);
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD,
    });
  }

  /**
   * Called when an account is locked due to failed attempts.
   * Increments the lockout counter for this IP.
   * If the counter exceeds the threshold, blocks the IP.
   */
  async recordLockoutFromIp(ipAddress: string): Promise<void> {
    if (!ipAddress || ipAddress === '::1') return;
    // Skip localhost during development

    const counterKey = `ip-lockout-count:${ipAddress}`;
    const blockKey = `ip-blocked:${ipAddress}`;

    const count = await this.redis.incr(counterKey);

    // Set expiry on first increment
    if (count === 1) {
      await this.redis.expire(counterKey, IP_LOCKOUT_WINDOW_SECONDS);
    }

    if (count >= IP_LOCKOUT_TRIGGER_THRESHOLD) {
      await this.redis.setex(blockKey, IP_BLOCK_DURATION_SECONDS, '1');
      this.logger.warn(
        `IP ${ipAddress} blocked for ${IP_BLOCK_DURATION_SECONDS / 60} minutes ` +
          `after triggering lockout on ${count} accounts`,
      );
    }
  }

  /**
   * Returns true if the IP is currently blocked.
   */
  async isBlocked(ipAddress: string): Promise<boolean> {
    if (!ipAddress || ipAddress === '::1') return false;
    const blocked = await this.redis.get(`ip-blocked:${ipAddress}`);
    return blocked === '1';
  }

  /**
   * Returns seconds remaining on the block, or 0 if not
   * blocked.
   */
  async getBlockTtl(ipAddress: string): Promise<number> {
    const ttl = await this.redis.ttl(`ip-blocked:${ipAddress}`);
    return ttl > 0 ? ttl : 0;
  }

  /**
   * Admin-only: manually unblock an IP address.
   */
  async unblockIp(ipAddress: string): Promise<void> {
    await this.redis.del(`ip-blocked:${ipAddress}`);
    await this.redis.del(`ip-lockout-count:${ipAddress}`);
    this.logger.log(`IP ${ipAddress} manually unblocked`);
  }
}
