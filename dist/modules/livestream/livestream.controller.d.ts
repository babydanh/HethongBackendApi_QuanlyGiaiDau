import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { AssignCameraDto } from './dto/assign-camera.dto';
import { CreateCameraDto } from './dto/create-camera.dto';
import { LivestreamService } from './livestream.service';
export declare class LivestreamController {
    private readonly livestreamService;
    constructor(livestreamService: LivestreamService);
    listCameras(tournamentId: string, user: JwtPayload): Promise<{
        playbackUrl: string | null;
        id: string;
        tournamentId: string;
        name: string;
        mode: string;
        protocol: string;
        streamName: string;
        streamKey: string;
        status: string;
        rtspUrlEncrypted: string | null;
        usernameEncrypted: string | null;
        passwordEncrypted: string | null;
        createdBy: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }[]>;
    listMatchLivestreams(tournamentId: string, user: JwtPayload): Promise<{
        id: string;
        matchId: string;
        cameraId: string | null;
        streamStatus: string;
        playbackUrl: string | null;
        recordingUrl: string | null;
        isFeatured: boolean;
        startedAt: Date | null;
        endedAt: Date | null;
        cameraName: string | null;
    }[]>;
    createCamera(tournamentId: string, user: JwtPayload, data: CreateCameraDto): Promise<{
        publish: {
            protocol: "RTMP" | "SRT";
            streamName: string;
            url: string;
            rtmpUrl: string;
            srtUrl: string;
        };
        id: string;
        name: string;
        mode: string;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
        createdBy: string | null;
        status: string;
        tournamentId: string;
        protocol: string;
        streamName: string;
        streamKey: string;
        playbackUrl: string | null;
        rtspUrlEncrypted: string | null;
        usernameEncrypted: string | null;
        passwordEncrypted: string | null;
    }>;
    deleteCamera(cameraId: string, user: JwtPayload): Promise<{
        id: string;
        tournamentId: string;
        name: string;
        mode: string;
        protocol: string;
        streamName: string;
        streamKey: string;
        status: string;
        playbackUrl: string | null;
        rtspUrlEncrypted: string | null;
        usernameEncrypted: string | null;
        passwordEncrypted: string | null;
        createdBy: string | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    assignCamera(matchId: string, user: JwtPayload, data: AssignCameraDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        startedAt: Date | null;
        matchId: string;
        playbackUrl: string | null;
        cameraId: string | null;
        streamStatus: string;
        recordingUrl: string | null;
        isFeatured: boolean;
        endedAt: Date | null;
    }>;
    startMatchStream(matchId: string, user: JwtPayload): Promise<{
        livestream: {
            id: string;
            matchId: string;
            cameraId: string | null;
            streamStatus: string;
            playbackUrl: string | null;
            recordingUrl: string | null;
            isFeatured: boolean;
            startedAt: Date | null;
            endedAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
        };
        publish: {
            protocol: "RTMP" | "SRT";
            streamName: string;
            url: string;
            rtmpUrl: string;
            srtUrl: string;
        };
        playbackUrl: string;
    }>;
    stopMatchStream(matchId: string, user: JwtPayload): Promise<{
        id: string;
        matchId: string;
        cameraId: string | null;
        streamStatus: string;
        playbackUrl: string | null;
        recordingUrl: string | null;
        isFeatured: boolean;
        startedAt: Date | null;
        endedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getMatchPlayback(matchId: string): Promise<{
        matchId: string;
        streamStatus: string;
        playbackUrl: null;
        cameraName?: undefined;
        startedAt?: undefined;
        endedAt?: undefined;
    } | {
        matchId: string;
        streamStatus: string;
        playbackUrl: string | null;
        cameraName: string;
        startedAt: Date | null;
        endedAt: Date | null;
    }>;
}
