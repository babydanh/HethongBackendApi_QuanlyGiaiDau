import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { AppVersionService } from './app-version.service';

@ApiTags('app-version')
@Controller('app/version')
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Kiểm tra phiên bản app và link cửa hàng' })
  getVersion(@Query('platform') platform?: string) {
    return this.appVersionService.getVersion(platform === 'ios' ? 'ios' : 'android');
  }
}
