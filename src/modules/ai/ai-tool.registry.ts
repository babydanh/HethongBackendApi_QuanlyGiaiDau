import { Injectable } from '@nestjs/common';
import type OpenAI from 'openai';
import type { AiToolDefinition } from './ai-tool.types';

const pageProperties = {
  page: { type: 'integer', minimum: 1, maximum: 50, description: 'Trang kết quả, mặc định 1.' },
  pageSize: { type: 'integer', minimum: 1, maximum: 10, description: 'Số kết quả, tối đa 10.' },
};

const emptyParameters = {
  type: 'object',
  properties: pageProperties,
  required: [],
  additionalProperties: false,
};

const definitions: AiToolDefinition[] = [
  {
    name: 'get_my_registrations',
    description: 'Lấy các giải mà tài khoản hiện tại đã đăng ký, không nhận userId từ model.',
    capability: 'read-only',
    requiresAuth: true,
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['all', 'active', 'completed', 'cancelled'] },
        sport: { type: 'string', maxLength: 80 },
        dateFrom: { type: 'string', maxLength: 32 },
        dateTo: { type: 'string', maxLength: 32 },
        ...pageProperties,
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_my_created_tournaments',
    description: 'Lấy các giải do tài khoản hiện tại tạo.',
    capability: 'read-only',
    requiresAuth: true,
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', maxLength: 40 },
        sport: { type: 'string', maxLength: 80 },
        ...pageProperties,
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_my_managed_tournaments',
    description: 'Lấy các giải tài khoản hiện tại đang quản lý hoặc đồng tổ chức.',
    capability: 'read-only',
    requiresAuth: true,
    parameters: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['all', 'organizer', 'co_organizer', 'referee'] },
        status: { type: 'string', maxLength: 40 },
        ...pageProperties,
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_my_communities',
    description: 'Lấy các CLB mà tài khoản hiện tại đã tạo hoặc đã tham gia.',
    capability: 'read-only',
    requiresAuth: true,
    parameters: emptyParameters,
  },
  {
    name: 'get_my_invitations',
    description: 'Lấy các lời mời CLB đang gửi tới tài khoản hiện tại.',
    capability: 'read-only',
    requiresAuth: true,
    parameters: emptyParameters,
  },
  {
    name: 'get_my_upcoming_matches',
    description: 'Lấy các trận sắp tới của tài khoản hiện tại.',
    capability: 'read-only',
    requiresAuth: true,
    parameters: {
      type: 'object',
      properties: {
        from: { type: 'string', maxLength: 32 },
        to: { type: 'string', maxLength: 32 },
        status: { type: 'string', enum: ['SCHEDULED', 'UPCOMING', 'all'] },
        ...pageProperties,
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_my_rankings',
    description: 'Lấy xếp hạng và ELO của tài khoản hiện tại.',
    capability: 'read-only',
    requiresAuth: true,
    parameters: {
      type: 'object',
      properties: {
        sport: { type: 'string', maxLength: 80 },
        season: { type: 'string', maxLength: 40 },
        ...pageProperties,
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'get_tournament_registration_status',
    description: 'Kiểm tra trạng thái đăng ký của tài khoản hiện tại trong một giải.',
    capability: 'read-only',
    requiresAuth: true,
    parameters: {
      type: 'object',
      properties: {
        tournamentId: { type: 'string', minLength: 1, maxLength: 80 },
        divisionId: { type: 'string', minLength: 1, maxLength: 80 },
      },
      required: ['tournamentId'],
      additionalProperties: false,
    },
  },
];

@Injectable()
export class AiToolRegistry {
  private readonly byName = new Map(definitions.map((definition) => [definition.name, definition]));

  getReadOnlyDefinitions(): AiToolDefinition[] {
    return definitions.filter((definition) => definition.capability === 'read-only');
  }

  get(name: string): AiToolDefinition | undefined {
    return this.byName.get(name);
  }

  getOpenAiTools(): OpenAI.Chat.ChatCompletionTool[] {
    return this.getReadOnlyDefinitions().map((definition) => ({
      type: 'function',
      function: {
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters,
      },
    })) as OpenAI.Chat.ChatCompletionTool[];
  }

  parseArguments(name: string, rawArguments: string | null | undefined): Record<string, unknown> {
    const definition = this.get(name);
    if (!definition) throw new Error(`Unknown AI tool: ${name}`);

    let parsed: unknown = {};
    if (rawArguments) {
      try {
        parsed = JSON.parse(rawArguments);
      } catch {
        throw new Error(`Invalid arguments for AI tool: ${name}`);
      }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Arguments must be an object for AI tool: ${name}`);
    }

    const value = parsed as Record<string, unknown>;
    const schema = definition.parameters as { properties?: Record<string, unknown>; required?: string[] };
    const allowed = new Set(Object.keys(schema.properties ?? {}));
    const unknown = Object.keys(value).filter((key) => !allowed.has(key));
    if (unknown.length > 0) throw new Error(`Unsupported arguments for AI tool: ${name}`);

    for (const required of schema.required ?? []) {
      if (value[required] === undefined || value[required] === null || value[required] === '') {
        throw new Error(`Missing required argument for AI tool: ${name}`);
      }
    }

    const page = value.page;
    const pageSize = value.pageSize;
    if (page !== undefined && (!Number.isInteger(page) || Number(page) < 1 || Number(page) > 50)) {
      throw new Error(`Invalid page for AI tool: ${name}`);
    }
    if (pageSize !== undefined && (!Number.isInteger(pageSize) || Number(pageSize) < 1 || Number(pageSize) > 10)) {
      throw new Error(`Invalid pageSize for AI tool: ${name}`);
    }

    return value;
  }
}
