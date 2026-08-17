"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateEloTierDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_elo_tier_dto_1 = require("./create-elo-tier.dto");
class UpdateEloTierDto extends (0, swagger_1.PartialType)(create_elo_tier_dto_1.CreateEloTierDto) {
}
exports.UpdateEloTierDto = UpdateEloTierDto;
//# sourceMappingURL=update-elo-tier.dto.js.map