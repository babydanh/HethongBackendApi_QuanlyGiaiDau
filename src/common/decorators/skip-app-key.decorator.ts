import { SetMetadata } from '@nestjs/common';

export const SKIP_APP_KEY = 'skipAppKey';
export const SkipAppKey = () => SetMetadata(SKIP_APP_KEY, true);
