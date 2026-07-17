import { SetMetadata } from '@nestjs/common';

export const VERIFIED_KEY = 'isVerified';
export const Verified = () => SetMetadata(VERIFIED_KEY, true);
