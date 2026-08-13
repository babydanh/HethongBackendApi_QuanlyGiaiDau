import { Global, Module } from '@nestjs/common';
import { AccountSanctionService } from './account-sanction.service';

@Global()
@Module({
  providers: [AccountSanctionService],
  exports: [AccountSanctionService],
})
export class AccountSanctionModule {}
