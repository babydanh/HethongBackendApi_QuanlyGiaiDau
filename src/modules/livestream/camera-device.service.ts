import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { CameraDeviceRow } from './live-session.repository';
import { LiveSessionRepository } from './live-session.repository';
import { CreateCameraDeviceDto } from './dto/create-camera-device.dto';
import { CreateDevicePairingTokenDto } from './dto/create-device-pairing-token.dto';
import { HeartbeatCameraDeviceDto } from './dto/heartbeat-camera-device.dto';
import { PairCameraDeviceDto } from './dto/pair-camera-device.dto';
import { UpdateCameraDeviceDto } from './dto/update-camera-device.dto';

const DEFAULT_PAIRING_TTL_SECONDS = 600;

export interface PublicCameraDevice {
  readonly id: string;
  readonly communityId: string;
  readonly name: string;
  readonly code: string | null;
  readonly defaultCourtId: string | null;
  readonly assignedOperatorId: string | null;
  readonly status: string;
  readonly lastHeartbeatAt: Date | null;
  readonly pairedAt: Date | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DevicePairingTokenResult {
  readonly device: PublicCameraDevice;
  readonly pairingToken: string;
  readonly expiresAt: Date;
}

@Injectable()
export class CameraDeviceService {
  constructor(private readonly repository: LiveSessionRepository) {}

  async listDevices(
    communityId: string,
    user: JwtPayload,
  ): Promise<PublicCameraDevice[]> {
    await this.assertCommunityManager(communityId, user);
    const devices =
      await this.repository.listCameraDevicesByCommunityId(communityId);
    return devices.map((device) => this.toPublicDevice(device));
  }

  async createDevice(
    data: CreateCameraDeviceDto,
    user: JwtPayload,
  ): Promise<PublicCameraDevice> {
    await this.assertCommunityManager(data.communityId, user);
    const device = await this.repository.createCameraDevice({
      communityId: data.communityId,
      name: data.name,
      code: data.code ?? null,
      defaultCourtId: data.defaultCourtId ?? null,
      assignedOperatorId: data.assignedOperatorId ?? null,
      createdBy: user.sub,
      notes: data.notes ?? null,
      status: 'UNPAIRED',
    });
    return this.toPublicDevice(device);
  }

  async createPairingToken(
    deviceId: string,
    data: CreateDevicePairingTokenDto,
    user: JwtPayload,
  ): Promise<DevicePairingTokenResult> {
    const device = await this.getDevice(deviceId);
    await this.assertCommunityManager(device.communityId, user);
    if (device.status === 'REVOKED') {
      throw this.domainError('CAMERA_NOT_READY', 'Thiết bị đã bị thu hồi.');
    }

    const ttlSeconds = data.ttlSeconds ?? DEFAULT_PAIRING_TTL_SECONDS;
    const pairingToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const updated = await this.repository.updateCameraDevice(device.id, {
      pairingTokenHash: this.hashToken(pairingToken),
      pairingTokenExpiresAt: expiresAt,
      status: 'UNPAIRED',
    });

    if (!updated) {
      throw new NotFoundException('Không tìm thấy thiết bị camera.');
    }

    return {
      device: this.toPublicDevice(updated),
      pairingToken,
      expiresAt,
    };
  }

  async pairDevice(
    data: PairCameraDeviceDto,
    user: JwtPayload,
  ): Promise<PublicCameraDevice> {
    const pairingTokenHash = this.hashToken(data.pairingToken);
    const device = await this.repository.findCameraDeviceForPairing(
      data.deviceId,
      pairingTokenHash,
    );
    if (!device || device.status === 'REVOKED') {
      throw this.domainError(
        'CAMERA_NOT_READY',
        'Mã ghép đôi không hợp lệ hoặc đã hết hạn.',
      );
    }
    if (
      !device.pairingTokenExpiresAt ||
      device.pairingTokenExpiresAt.getTime() <= Date.now()
    ) {
      throw this.domainError(
        'PUBLISH_CONFIG_EXPIRED',
        'Mã ghép đôi đã hết hạn.',
      );
    }
    if (device.assignedOperatorId && device.assignedOperatorId !== user.sub) {
      throw new ForbiddenException('Thiết bị đã được gán cho operator khác.');
    }

    const paired = await this.repository.consumeCameraDevicePairingToken(
      device.id,
      pairingTokenHash,
      this.hashToken(data.deviceFingerprint),
      device.assignedOperatorId ?? user.sub,
    );
    if (!paired) {
      throw this.domainError(
        'CAMERA_NOT_READY',
        'Mã ghép đôi không hợp lệ hoặc đã được sử dụng.',
      );
    }
    return this.toPublicDevice(paired);
  }

  async updateDevice(
    deviceId: string,
    data: UpdateCameraDeviceDto,
    user: JwtPayload,
  ): Promise<PublicCameraDevice> {
    const device = await this.getDevice(deviceId);
    await this.assertCommunityManager(device.communityId, user);
    const updated = await this.repository.updateCameraDevice(device.id, {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.code !== undefined ? { code: data.code } : {}),
      ...(data.defaultCourtId !== undefined
        ? { defaultCourtId: data.defaultCourtId }
        : {}),
      ...(data.assignedOperatorId !== undefined
        ? { assignedOperatorId: data.assignedOperatorId }
        : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    });
    if (!updated) {
      throw new NotFoundException('Không tìm thấy thiết bị camera.');
    }
    return this.toPublicDevice(updated);
  }

  async heartbeat(
    deviceId: string,
    data: HeartbeatCameraDeviceDto,
    user: JwtPayload,
  ): Promise<PublicCameraDevice> {
    const device = await this.getDevice(deviceId);
    const canManage = await this.hasManagerAccess(device.communityId, user);
    if (!canManage && device.assignedOperatorId !== user.sub) {
      throw new ForbiddenException(
        'Bạn không có quyền gửi heartbeat cho thiết bị này.',
      );
    }
    if (
      device.deviceFingerprintHash &&
      device.deviceFingerprintHash !== this.hashToken(data.deviceFingerprint)
    ) {
      throw new ForbiddenException(
        'Thiết bị gửi heartbeat không khớp thiết bị đã ghép đôi.',
      );
    }
    const activeSession =
      await this.repository.findActiveLiveSessionByCameraDeviceId(device.id);
    const updated = await this.repository.updateCameraDevice(device.id, {
      lastHeartbeatAt: new Date(),
      status: activeSession
        ? 'LIVE'
        : device.status === 'REVOKED'
          ? 'REVOKED'
          : 'ONLINE',
    });
    if (!updated) {
      throw new NotFoundException('Không tìm thấy thiết bị camera.');
    }
    return this.toPublicDevice(updated);
  }

  async revokeDevice(
    deviceId: string,
    user: JwtPayload,
  ): Promise<PublicCameraDevice> {
    const device = await this.getDevice(deviceId);
    await this.assertCommunityManager(device.communityId, user);
    const activeSession =
      await this.repository.findActiveLiveSessionByCameraDeviceId(device.id);
    if (activeSession) {
      throw this.domainError(
        'CAMERA_ALREADY_LIVE',
        'Không thể thu hồi camera đang livestream.',
      );
    }
    const revoked = await this.repository.updateCameraDevice(device.id, {
      status: 'REVOKED',
      pairingTokenHash: null,
      pairingTokenExpiresAt: null,
      assignedOperatorId: null,
    });
    if (!revoked) {
      throw new NotFoundException('Không tìm thấy thiết bị camera.');
    }
    return this.toPublicDevice(revoked);
  }

  private async getDevice(deviceId: string): Promise<CameraDeviceRow> {
    const device = await this.repository.findCameraDeviceById(deviceId);
    if (!device) {
      throw new NotFoundException('Không tìm thấy thiết bị camera.');
    }
    return device;
  }

  private async assertCommunityManager(
    communityId: string,
    user: JwtPayload,
  ): Promise<void> {
    if (this.isSystemAdmin(user)) {
      return;
    }
    if (!(await this.hasManagerAccess(communityId, user))) {
      throw new ForbiddenException(
        'Bạn không có quyền quản lý livestream của cộng đồng này.',
      );
    }
  }

  private async hasManagerAccess(
    communityId: string,
    user: JwtPayload,
  ): Promise<boolean> {
    return this.repository.hasCommunityManagerAccess(communityId, user.sub);
  }

  private isSystemAdmin(user: JwtPayload): boolean {
    return user.roles?.includes('ADMIN') === true || user.role === 'ADMIN';
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private domainError(code: string, message: string): BadRequestException {
    return new BadRequestException({ code, message });
  }

  private toPublicDevice(device: CameraDeviceRow): PublicCameraDevice {
    return {
      id: device.id,
      communityId: device.communityId,
      name: device.name,
      code: device.code,
      defaultCourtId: device.defaultCourtId,
      assignedOperatorId: device.assignedOperatorId,
      status: device.status,
      lastHeartbeatAt: device.lastHeartbeatAt,
      pairedAt: device.pairedAt,
      notes: device.notes,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    };
  }
}
