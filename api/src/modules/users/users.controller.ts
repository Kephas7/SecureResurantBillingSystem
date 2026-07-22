import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UsersService, SafeUser } from './users.service';
import { CreateUserDto, UpdateUserDto } from './users.dto';

// Every route here is restricted to @Roles('ADMIN'). RolesGuard re-fetches
// the caller's role from the database on every request (never from the
// session), so if an Admin account is downgraded mid-session, access to
// this entire controller is lost on their very next request - no need
// for them to log out or for a token to expire first.
@Controller('users')
@Roles('ADMIN')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(): Promise<SafeUser[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<SafeUser> {
    return this.usersService.findOne(id);
  }

  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(@Body() dto: CreateUserDto, @CurrentUser() actorId: string): Promise<SafeUser> {
    return this.usersService.create(dto, actorId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actorId: string,
  ): Promise<SafeUser> {
    return this.usersService.update(id, dto, actorId);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  async deactivate(@Param('id') id: string, @CurrentUser() actorId: string): Promise<void> {
    await this.usersService.deactivate(id, actorId);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/unlock')
  async unlock(@Param('id') id: string, @CurrentUser() actorId: string): Promise<{ message: string }> {
    await this.usersService.unlockAccount(id, actorId);
    return { message: 'Account unlocked successfully' };
  }

  /**
   * POST /users/ip-blocks/:ip/unblock
   * Admin-only: manually unblock an IP address.
   */
  @Post('ip-blocks/:ip/unblock')
  @HttpCode(HttpStatus.OK)
  async unblockIp(@Param('ip') ip: string, @CurrentUser() actorId: string): Promise<{ message: string }> {
    // Basic IP format validation to prevent path traversal in the Redis key
    const ipRegex = /^[\d.:a-fA-F]+$/;
    if (!ipRegex.test(ip)) {
      throw new BadRequestException('Invalid IP address format');
    }

    await this.usersService.unblockIp(ip, actorId);

    return { message: `IP ${ip} has been unblocked` };
  }
}
