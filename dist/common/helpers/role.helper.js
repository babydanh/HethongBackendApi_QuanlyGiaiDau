"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasRole = hasRole;
exports.isAdminUser = isAdminUser;
exports.isMatchOwnerOrAdmin = isMatchOwnerOrAdmin;
const enums_1 = require("../constants/enums");
function hasRole(user, role) {
    if (!user)
        return false;
    if (Array.isArray(user.roles)) {
        return user.roles.includes(role);
    }
    return user.role === role;
}
function isAdminUser(user) {
    return hasRole(user, enums_1.UserRole.ADMIN);
}
function isMatchOwnerOrAdmin(user, tournamentCreatedBy) {
    if (!user)
        return false;
    if (isAdminUser(user))
        return true;
    return Boolean(tournamentCreatedBy && user.sub && tournamentCreatedBy === user.sub);
}
//# sourceMappingURL=role.helper.js.map