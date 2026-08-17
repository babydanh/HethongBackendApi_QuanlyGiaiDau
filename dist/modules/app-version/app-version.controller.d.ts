import { AppVersionService } from './app-version.service';
export declare class AppVersionController {
    private readonly appVersionService;
    constructor(appVersionService: AppVersionService);
    getVersion(platform?: string): Promise<{
        platform: "android" | "ios";
        latestVersion: string;
        minimumVersion: string;
        storeUrl: string;
        releaseNotes: string;
    }>;
}
