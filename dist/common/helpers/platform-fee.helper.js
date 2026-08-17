"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcPlatformFee = calcPlatformFee;
function calcPlatformFee(entryFee, platformFeePercentage) {
    if (platformFeePercentage === 0) {
        return 0;
    }
    if (entryFee >= 100000) {
        return Math.round(entryFee * (platformFeePercentage / 100));
    }
    return 5000;
}
//# sourceMappingURL=platform-fee.helper.js.map