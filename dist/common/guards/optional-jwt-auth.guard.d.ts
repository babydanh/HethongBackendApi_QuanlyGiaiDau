declare const OptionalJwtAuthGuard_base: import("@nestjs/passport").Type<import("@nestjs/passport").IAuthGuard>;
export declare class OptionalJwtAuthGuard extends OptionalJwtAuthGuard_base {
    handleRequest<TUser = unknown>(_err: unknown, user: TUser | false | null): NonNullable<TUser> | undefined;
}
export {};
