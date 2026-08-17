"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_1 = __importDefault(require("postgres"));
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const host = process.env.DB_HOST || 'localhost';
const port = parseInt(process.env.DB_PORT || '5433', 10);
const user = process.env.DB_USERNAME || 'postgres';
const password = process.env.DB_PASSWORD || 'your_password';
const database = process.env.DB_DATABASE || 'tournament_db';
async function run() {
    const sql = (0, postgres_1.default)(`postgres://${user}:${password}@${host}:${port}/${database}`);
    try {
        console.log('Connecting to database and running ALTER statements...');
        await sql `
      ALTER TABLE community_rankings 
      ADD COLUMN IF NOT EXISTS peak_elo integer DEFAULT 1000 NOT NULL;
    `.catch(err => {
            console.error('Error altering community_rankings:', err.message);
        });
        await sql `
      ALTER TABLE community_rankings 
      ADD COLUMN IF NOT EXISTS last_active_at timestamp with time zone DEFAULT now() NOT NULL;
    `.catch(err => {
            console.error('Error altering community_rankings last_active_at:', err.message);
        });
        console.log('Processed community_rankings peak_elo and last_active_at.');
        await sql `
      ALTER TABLE payments 
      ADD COLUMN IF NOT EXISTS division_id uuid;
    `.catch(err => {
            console.error('Error altering payments:', err.message);
        });
        console.log('Processed payments division_id.');
        await sql `
      ALTER TABLE user_ranks 
      ADD COLUMN IF NOT EXISTS peak_elo integer DEFAULT 1000 NOT NULL;
    `.catch(err => {
            console.error('Error altering user_ranks peak_elo:', err.message);
        });
        await sql `
      ALTER TABLE user_ranks 
      ADD COLUMN IF NOT EXISTS last_active_at timestamp with time zone DEFAULT now() NOT NULL;
    `.catch(err => {
            console.error('Error altering user_ranks last_active_at:', err.message);
        });
        console.log('Processed user_ranks columns.');
        await sql `
      ALTER TABLE auth_providers 
      ADD CONSTRAINT auth_providers_provider_provider_user_id_unique UNIQUE (provider, provider_user_id);
    `.catch(err => {
            if (err.code === '42P07') {
                console.log('Unique constraint on auth_providers already exists.');
            }
            else {
                console.error('Error altering auth_providers:', err.message);
            }
        });
        console.log('Database repair completed!');
    }
    catch (error) {
        console.error('Failed to repair database columns:', error);
    }
    finally {
        await sql.end();
    }
}
run();
//# sourceMappingURL=repair-db.js.map