"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateCommunityDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_community_dto_1 = require("./create-community.dto");
class UpdateCommunityDto extends (0, swagger_1.PartialType)(create_community_dto_1.CreateCommunityDto) {
}
exports.UpdateCommunityDto = UpdateCommunityDto;
//# sourceMappingURL=update-community.dto.js.map