import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IpBlockService } from './ip-block.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, IpBlockService],
  exports: [AuthService, IpBlockService],
})
export class AuthModule {}
