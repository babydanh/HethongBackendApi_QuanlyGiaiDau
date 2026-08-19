export type AiToolCapability = 'read-only' | 'draft' | 'mutation-reversible' | 'mutation-sensitive';

export type AiToolResultStatus =
  | 'SUCCESS'
  | 'EMPTY_RESULT'
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'UPSTREAM_ERROR'
  | 'INTERNAL_ERROR';

export type AiUiBlockType =
  | 'registration'
  | 'tournament'
  | 'community'
  | 'match'
  | 'payment'
  | 'invitation'
  | 'confirmation'
  | 'empty'
  | 'error';

export interface AiUiAction {
  label: string;
  action: 'navigate' | 'retry' | 'confirm' | 'cancel';
  href?: string;
  intent?: 'primary' | 'secondary' | 'danger';
}

export interface AiUiBlock {
  type: AiUiBlockType;
  id: string;
  title?: string;
  data: Record<string, unknown>;
  actions?: AiUiAction[];
}

export interface AiToolContext {
  userId?: string;
  roles: string[];
  currentUrl?: string;
  pageTitle?: string;
  isMobile?: boolean;
}

export interface AiToolPagination {
  page: number;
  pageSize: number;
  total?: number;
  hasNextPage?: boolean;
}

export interface AiToolResultEnvelope<T = unknown> {
  status: AiToolResultStatus;
  data: T;
  viewer: {
    authenticated: boolean;
  };
  dataAsOf: string;
  permissions: Record<string, boolean>;
  pagination?: AiToolPagination;
  errorCode?: string | null;
  nextActions: string[];
  uiBlocks?: AiUiBlock[];
}

export interface AiToolDefinition {
  name: string;
  description: string;
  capability: AiToolCapability;
  requiresAuth: boolean;
  parameters: Record<string, unknown>;
}

export interface AiToolEvent {
  type: 'tool_start' | 'tool_result' | 'tool_error';
  tool: string;
  label: string;
  round: number;
  status?: AiToolResultStatus;
  uiBlocks?: AiUiBlock[];
}

export interface AiAssistantResponse {
  content: string;
  uiBlocks: AiUiBlock[];
  toolEvents: AiToolEvent[];
}

export type AiStreamEvent =
  | { type: 'content'; content: string }
  | { type: 'tool'; event: AiToolEvent }
  | { type: 'ui_blocks'; blocks: AiUiBlock[] }
  | { type: 'done' };
