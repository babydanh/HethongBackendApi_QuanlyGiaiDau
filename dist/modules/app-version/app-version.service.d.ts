type AppPlatform = 'android' | 'ios';
export declare class AppVersionService {
    private readonly db;
    constructor(db: any);
    getVersion(platform: AppPlatform): Promise<{
        platform: AppPlatform;
        latestVersion: string;
        minimumVersion: string;
        storeUrl: string;
        releaseNotes: string;
    }>;
}
export {};
