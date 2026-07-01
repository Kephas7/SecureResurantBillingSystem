import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/guards/session.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RegisterDto, VerifyMfaDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Tighter than the global 100/min limit: login is the primary target for
  // credential-stuffing/brute-force, so it gets its own stricter budget.
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) _res: Response,
  ): Promise<{ message: string; requiresMfa: boolean; role: string }> {
    const ip = req.ip ?? 'unknown';
    const result = await this.authService.login(dto, ip);

    // Regenerating the session on login (rather than reusing whatever
    // session id the client presented pre-auth) prevents session fixation:
    // an attacker who tricked a victim into using a known session id
    // before login can't inherit an authenticated session afterwards.
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err) => (err ? reject(err) : resolve()));
    });

    req.session.userId = result.userId;
    req.session.mfaVerified = !result.requiresMfa;

    return { message: 'Login successful', requiresMfa: result.requiresMfa, role: result.role };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@CurrentUser() userId: string | null, @Req() req: Request): Promise<{ message: string }> {
    if (userId) {
      await this.authService.logout(userId);
    }

    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });

    return { message: 'Logged out successfully' };
  }

  // Only admins can create accounts - there is no public self-registration
  // endpoint, which removes an entire class of abuse (spam signups,
  // automated account creation) from the attack surface.
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @Post('register')
  async register(@Body() dto: RegisterDto): Promise<{ message: string; userId: string }> {
    const user = await this.authService.register(dto);
    return { message: 'User registered successfully', userId: user.id };
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @CurrentUser() userId: string | null,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    await this.authService.changePassword(userId, dto);
    return { message: 'Password changed successfully' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('mfa/setup')
  async setupMfa(
    @CurrentUser() userId: string | null,
  ): Promise<{ otpauthUrl: string; qrCodeDataUrl: string }> {
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const { otpauthUrl, qrCodeDataUrl } = await this.authService.setupMfa(userId);
    // The raw secret is deliberately never returned to the client here -
    // it only travels embedded in the QR code / otpauth URL, and is
    // re-submitted by the client for verify-setup to prove the
    // authenticator app actually captured it.
    return { otpauthUrl, qrCodeDataUrl };
  }

  @HttpCode(HttpStatus.OK)
  @Post('mfa/verify-setup')
  async verifySetup(
    @CurrentUser() userId: string | null,
    @Body() body: { token: string; secret: string },
  ): Promise<{ message: string }> {
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    await this.authService.verifyAndEnableMfa(userId, body.token, body.secret);
    return { message: 'MFA enabled successfully' };
  }

  // Public: called mid-login, before req.session.mfaVerified is true, so
  // the global SessionGuard would otherwise reject the request.
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('mfa/verify')
  async verifyMfa(@Body() dto: VerifyMfaDto, @Req() req: Request): Promise<{ message: string }> {
    const userId = req.session.userId;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const verified = await this.authService.verifyMfaToken(userId, dto.token);
    if (!verified) {
      throw new UnauthorizedException('Invalid MFA token');
    }

    req.session.mfaVerified = true;

    return { message: 'MFA verified' };
  }
}
