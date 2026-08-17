import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private configService;
    constructor(configService: ConfigService);
    validate(payload: {
        sub: string;
        email: string;
        roles: string[];
        isEmailVerified?: boolean;
        isMock?: boolean;
    }): {
        id: string;
        sub: string;
        email: string;
        roles: string[];
        isEmailVerified: boolean | undefined;
        isMock: boolean | undefined;
    };
}
export {};
