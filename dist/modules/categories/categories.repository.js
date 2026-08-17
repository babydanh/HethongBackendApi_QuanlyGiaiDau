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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesRepository = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
let CategoriesRepository = class CategoriesRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findAllCategories(query) {
        let whereClause = undefined;
        if (query.search) {
            whereClause = (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema.categories.name, `%${query.search}%`), (0, drizzle_orm_1.ilike)(schema.categories.slug, `%${query.search}%`));
        }
        const list = await this.db.select().from(schema.categories).where(whereClause);
        const results = list.map((cat) => {
            const config = cat.categoryConfig || {};
            const isActive = config.isActive !== false;
            return {
                ...cat,
                isActive,
            };
        });
        if (query.includeInactive === true || String(query.includeInactive) === 'true') {
            return results;
        }
        return results.filter((cat) => cat.isActive);
    }
    async findCategoryById(id) {
        const categories = await this.db
            .select()
            .from(schema.categories)
            .where((0, drizzle_orm_1.eq)(schema.categories.id, id))
            .limit(1);
        if (!categories[0])
            return null;
        const cat = categories[0];
        const config = cat.categoryConfig || {};
        return {
            ...cat,
            isActive: config.isActive !== false,
        };
    }
    async findCategoryBySlug(slug) {
        const categories = await this.db
            .select()
            .from(schema.categories)
            .where((0, drizzle_orm_1.eq)(schema.categories.slug, slug))
            .limit(1);
        if (!categories[0])
            return null;
        const cat = categories[0];
        const config = cat.categoryConfig || {};
        return {
            ...cat,
            isActive: config.isActive !== false,
        };
    }
    async createCategory(data) {
        const [category] = await this.db
            .insert(schema.categories)
            .values(data)
            .returning();
        return category;
    }
    async updateCategory(id, data) {
        const existing = await this.findCategoryById(id);
        const existingConfig = existing?.categoryConfig || {};
        const updatedConfig = {
            ...existingConfig,
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        };
        const updateData = { ...data };
        delete updateData.isActive;
        const [category] = await this.db
            .update(schema.categories)
            .set({
            ...updateData,
            categoryConfig: updatedConfig,
        })
            .where((0, drizzle_orm_1.eq)(schema.categories.id, id))
            .returning();
        return {
            ...category,
            isActive: updatedConfig.isActive !== false,
        };
    }
    async deleteCategory(id) {
        const [category] = await this.db
            .delete(schema.categories)
            .where((0, drizzle_orm_1.eq)(schema.categories.id, id))
            .returning();
        return category;
    }
    async findEloTiersByCategory(categoryId) {
        return await this.db
            .select()
            .from(schema.eloTiers)
            .where((0, drizzle_orm_1.eq)(schema.eloTiers.categoryId, categoryId));
    }
    async findEloTierById(id) {
        const tiers = await this.db
            .select()
            .from(schema.eloTiers)
            .where((0, drizzle_orm_1.eq)(schema.eloTiers.id, id))
            .limit(1);
        return tiers[0];
    }
    async createEloTier(data) {
        const [tier] = await this.db
            .insert(schema.eloTiers)
            .values(data)
            .returning();
        return tier;
    }
    async updateEloTier(id, data) {
        const [tier] = await this.db
            .update(schema.eloTiers)
            .set(data)
            .where((0, drizzle_orm_1.eq)(schema.eloTiers.id, id))
            .returning();
        return tier;
    }
    async deleteEloTier(id) {
        const [tier] = await this.db
            .delete(schema.eloTiers)
            .where((0, drizzle_orm_1.eq)(schema.eloTiers.id, id))
            .returning();
        return tier;
    }
};
exports.CategoriesRepository = CategoriesRepository;
exports.CategoriesRepository = CategoriesRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object])
], CategoriesRepository);
//# sourceMappingURL=categories.repository.js.map