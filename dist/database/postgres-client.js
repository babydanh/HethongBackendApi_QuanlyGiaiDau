"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPostgresClient = createPostgresClient;
exports.createPostgresClientFromConfig = createPostgresClientFromConfig;
exports.createPostgresClientFromEnv = createPostgresClientFromEnv;
const postgres_1 = __importDefault(require("postgres"));
const DEFAULT_SSL = {
    rejectUnauthorized: false,
};
function createPostgresClient(config, overrides = {}) {
    const isSSLEnabled = process.env.DB_SSL === 'true';
    return (0, postgres_1.default)({
        host: config.host,
        port: config.port,
        username: config.username,
        password: config.password,
        database: config.database,
        ssl: isSSLEnabled ? (config.ssl ?? DEFAULT_SSL) : false,
        prepare: false,
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
        onnotice: () => { },
        connection: {
            search_path: 'public',
        },
        ...overrides,
    });
}
function createPostgresClientFromConfig(configService, overrides = {}) {
    return createPostgresClient({
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.database'),
    }, overrides);
}
function createPostgresClientFromEnv(overrides = {}) {
    return createPostgresClient({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
    }, overrides);
}
//# sourceMappingURL=postgres-client.js.map