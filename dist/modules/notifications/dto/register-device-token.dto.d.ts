export declare class RegisterDeviceTokenDto {
    token: string;
    platform?: 'ANDROID' | 'IOS' | 'WEB';
    deviceInfo?: string;
}
export declare class RemoveDeviceTokenDto {
    token: string;
}
