// TC-BRK: sơ đồ đôi / nhiều nội dung. Fake DB chạy đúng các câu SQL drizzle mà generator và repository phát ra.
import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { getTableColumns, getTableName, type SQL, type Table } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '../../database/schema';
import { BracketGeneratorService } from './bracket-generator.service';
import { TournamentBracketRepository } from './repositories/tournament-bracket.repository';
import { TournamentBracketService } from './services/tournament-bracket.service';
import { TournamentsController } from './tournaments.controller';

type Row = Record<string, unknown>;
type BracketServiceDeps = ConstructorParameters<typeof TournamentBracketService>;
type BracketRepoDeps = ConstructorParameters<typeof TournamentBracketRepository>;
type GeneratorDeps = ConstructorParameters<typeof BracketGeneratorService>;

// ---- Parse the SQL drizzle renders for WHERE, then evaluate it on fake rows ----
type Tok =
  | { k: 'col'; t: string; c: string }
  | { k: 'param'; i: number }
  | { k: 'sym'; v: string }
  | { k: 'kw'; v: string };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let pos = 0;
  while (pos < src.length) {
    const rest = src.slice(pos);
    const ws = /^\s+/.exec(rest);
    if (ws) { pos += ws[0].length; continue; }
    const col = /^"([^"]+)"\."([^"]+)"/.exec(rest);
    if (col) { toks.push({ k: 'col', t: col[1], c: col[2] }); pos += col[0].length; continue; }
    const par = /^\$(\d+)/.exec(rest);
    if (par) { toks.push({ k: 'param', i: Number(par[1]) - 1 }); pos += par[0].length; continue; }
    const sym = /^(<>|<=|=|\(|\)|,)/.exec(rest);
    if (sym) { toks.push({ k: 'sym', v: sym[1] }); pos += sym[0].length; continue; }
    const kw = /^[A-Za-z_]+/.exec(rest);
    if (kw) { toks.push({ k: 'kw', v: kw[0].toLowerCase() }); pos += kw[0].length; continue; }
    throw new Error(`unsupported SQL near: ${rest.slice(0, 60)}`);
  }
  return toks;
}

type Expr =
  | { op: 'col'; t: string; c: string }
  | { op: 'param'; i: number }
  | { op: 'lit'; v: boolean | null }
  | { op: 'eq' | 'ne' | 'lte' | 'and' | 'or'; a: Expr; b: Expr }
  | { op: 'isNull' | 'isNotNull' | 'not'; a: Expr }
  | { op: 'in'; a: Expr; list: Expr[] };

class Parser {
  private p = 0;
  constructor(private readonly toks: Tok[]) {}

  parse(): Expr {
    const tree = this.or();
    if (this.p !== this.toks.length) throw new Error(`trailing tokens at ${this.p}`);
    return tree;
  }

  private kw(v: string): boolean {
    const t = this.toks[this.p];
    return t?.k === 'kw' && t.v === v;
  }

  private sym(v: string): boolean {
    const t = this.toks[this.p];
    return t?.k === 'sym' && t.v === v;
  }

  private expectSym(v: string): void {
    if (!this.sym(v)) throw new Error(`expected ${v} at token ${this.p}`);
    this.p++;
  }

  private or(): Expr {
    let a = this.and();
    while (this.kw('or')) { this.p++; a = { op: 'or', a, b: this.and() }; }
    return a;
  }

  private and(): Expr {
    let a = this.not();
    while (this.kw('and')) { this.p++; a = { op: 'and', a, b: this.not() }; }
    return a;
  }

  private not(): Expr {
    if (this.kw('not')) { this.p++; return { op: 'not', a: this.not() }; }
    return this.pred();
  }

  private operand(): Expr {
    const t = this.toks[this.p];
    if (!t) throw new Error('unexpected end of SQL');
    this.p++;
    if (t.k === 'col') return { op: 'col', t: t.t, c: t.c };
    if (t.k === 'param') return { op: 'param', i: t.i };
    if (t.k === 'kw' && (t.v === 'true' || t.v === 'false')) return { op: 'lit', v: t.v === 'true' };
    if (t.k === 'kw' && t.v === 'null') return { op: 'lit', v: null };
    throw new Error(`bad operand ${JSON.stringify(t)}`);
  }

  private pred(): Expr {
    if (this.sym('(')) {
      this.p++;
      const inner = this.or();
      this.expectSym(')');
      return inner;
    }
    const left = this.operand();
    if (this.sym('=')) { this.p++; return { op: 'eq', a: left, b: this.operand() }; }
    if (this.sym('<>')) { this.p++; return { op: 'ne', a: left, b: this.operand() }; }
    if (this.sym('<=')) { this.p++; return { op: 'lte', a: left, b: this.operand() }; }
    if (this.kw('is')) {
      this.p++;
      let neg = false;
      if (this.kw('not')) { this.p++; neg = true; }
      if (!this.kw('null')) throw new Error('expected null after is');
      this.p++;
      return { op: neg ? 'isNotNull' : 'isNull', a: left };
    }
    if (this.kw('in')) {
      this.p++;
      this.expectSym('(');
      const list: Expr[] = [this.operand()];
      while (this.sym(',')) { this.p++; list.push(this.operand()); }
      this.expectSym(')');
      return { op: 'in', a: left, list };
    }
    return left;
  }
}

const propCache = new Map<Table, Map<string, string>>();

function propFor(table: Table, tableName: string, colName: string): string {
  if (getTableName(table) !== tableName) {
    throw new Error(`cross-table ref ${tableName} inside ${getTableName(table)}`);
  }
  let byCol = propCache.get(table);
  if (!byCol) {
    byCol = new Map<string, string>();
    for (const [prop, col] of Object.entries(getTableColumns(table))) byCol.set(col.name, prop);
    propCache.set(table, byCol);
  }
  const prop = byCol.get(colName);
  if (!prop) throw new Error(`unknown column ${tableName}.${colName}`);
  return prop;
}

type Ctx = { row: Row; params: unknown[]; table: Table };

function evaluate(e: Expr, ctx: Ctx): unknown {
  switch (e.op) {
    case 'col': return ctx.row[propFor(ctx.table, e.t, e.c)] ?? null;
    case 'param': return ctx.params[e.i] ?? null;
    case 'lit': return e.v;
    case 'eq': return evaluate(e.a, ctx) === evaluate(e.b, ctx);
    case 'ne': return evaluate(e.a, ctx) !== evaluate(e.b, ctx);
    case 'lte': {
      const a = evaluate(e.a, ctx);
      const b = evaluate(e.b, ctx);
      return a !== null && b !== null && Number(a) <= Number(b);
    }
    case 'isNull': return evaluate(e.a, ctx) === null;
    case 'isNotNull': return evaluate(e.a, ctx) !== null;
    case 'in': {
      const x = evaluate(e.a, ctx);
      return e.list.some((item) => evaluate(item, ctx) === x);
    }
    case 'and': return Boolean(evaluate(e.a, ctx)) && Boolean(evaluate(e.b, ctx));
    case 'or': return Boolean(evaluate(e.a, ctx)) || Boolean(evaluate(e.b, ctx));
    case 'not': return !evaluate(e.a, ctx);
  }
}

const dialect = new PgDialect();
const treeCache = new Map<string, Expr>();

function rowMatches(table: Table, cond: SQL | undefined, row: Row): boolean {
  if (cond === undefined) return true;
  const q = dialect.sqlToQuery(cond);
  const tree = treeCache.get(q.sql) ?? new Parser(tokenize(q.sql)).parse();
  treeCache.set(q.sql, tree);
  return Boolean(evaluate(tree, { row, params: q.params, table }));
}

// ---- Fake DB: only the query shapes used by the bracket generator and seeding repo ----
class Query {
  constructor(private readonly rows: Row[]) {}

  returning(): Promise<Row[]> {
    return Promise.resolve(this.rows);
  }

  then<T1 = Row[], T2 = never>(
    onok?: ((v: Row[]) => T1 | PromiseLike<T1>) | null,
    onerr?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
  ): Promise<T1 | T2> {
    return Promise.resolve(this.rows).then(onok, onerr);
  }
}

class SelectQ {
  private cond: SQL | undefined;
  private lim: number | undefined;
  constructor(private readonly db: FakeDb, private readonly table: Table) {}

  where(c: SQL | undefined): SelectQ {
    this.cond = c;
    return this;
  }

  limit(n: number): SelectQ {
    this.lim = n;
    return this;
  }

  // The fake is single-threaded: FOR UPDATE is recorded for ordering checks, not enforced.
  for(mode: string): SelectQ {
    this.db.events.push(`lock:${getTableName(this.table)}:${mode}`);
    return this;
  }

  private exec(): Promise<Row[]> {
    let rows = this.db.rowsOf(this.table).filter((r) => rowMatches(this.table, this.cond, r));
    if (this.lim !== undefined) rows = rows.slice(0, this.lim);
    return Promise.resolve(rows.map((r) => ({ ...r })));
  }

  then<T1 = Row[], T2 = never>(
    onok?: ((v: Row[]) => T1 | PromiseLike<T1>) | null,
    onerr?: ((e: unknown) => T2 | PromiseLike<T2>) | null,
  ): Promise<T1 | T2> {
    return this.exec().then(onok, onerr);
  }
}

class SelectBuilder {
  constructor(private readonly db: FakeDb) {}

  from(table: Table): SelectQ {
    return new SelectQ(this.db, table);
  }
}

class InsertQ {
  constructor(private readonly db: FakeDb, private readonly table: Table) {}

  values(v: Row | Row[]): Query {
    const list = Array.isArray(v) ? v : [v];
    const rows = list.map((r) => ({ id: randomUUID(), ...r }));
    const acc = this.db.inserted.get(this.table) ?? [];
    acc.push(...rows);
    this.db.inserted.set(this.table, acc);
    this.db.events.push(`insert:${getTableName(this.table)}`);
    return new Query(rows);
  }
}

class UpdateQ {
  private value: Row = {};
  constructor(private readonly db: FakeDb, private readonly table: Table) {}

  set(v: Row): UpdateQ {
    this.value = v;
    return this;
  }

  where(c: SQL | undefined): Query {
    this.db.updates.push({ table: this.table, set: this.value, cond: c });
    this.db.events.push(`update:${getTableName(this.table)}`);
    return new Query([]);
  }
}

class FakeDb {
  readonly tables = new Map<Table, Row[]>();
  readonly inserted = new Map<Table, Row[]>();
  readonly updates: { table: Table; set: Row; cond: SQL | undefined }[] = [];
  readonly events: string[] = [];

  seed(table: Table, rows: Row[]): void {
    this.tables.set(table, rows);
  }

  rowsOf(table: Table): Row[] {
    return this.tables.get(table) ?? [];
  }

  select(): SelectBuilder {
    return new SelectBuilder(this);
  }

  insert(table: Table): InsertQ {
    return new InsertQ(this, table);
  }

  update(table: Table): UpdateQ {
    return new UpdateQ(this, table);
  }

  async transaction<R>(cb: (tx: FakeDb) => Promise<R>): Promise<R> {
    return await cb(this);
  }
}

// ---- Fixtures ----
const T = 'tournament-1';
const ORG = 'org-1';
const DIV_A = 'div-a';
const DIV_B = 'div-b';
// Must equal the message TournamentLiteRepository throws when fewer than two athletes wait.
const NO_PAIRABLE = 'Cần ít nhất 2 người chơi đang chờ ghép cặp.';
const PICK_DIVISION = 'Vui lòng chọn nội dung để tạo sơ đồ.';

function divisionOf(id: string, name: string, bracketType: string | null, matchType = 'DOUBLES'): Row {
  return { id, name, bracketType, matchType };
}

function makeTournament(config: Row = {}): Row {
  return {
    id: T, name: 'Giải test', status: 'REGISTRATION_CLOSED', tournamentType: 'OPEN',
    communityId: null, parentId: null, createdBy: ORG, venueId: null,
    matchType: 'DOUBLES', tournamentConfig: config,
  };
}

// `__rosterCount` = roster rows the fixture seeds for this participant (default: two account athletes).
function pairRow(name: string, division: string | null, over: Row = {}): Row {
  return {
    id: randomUUID(), tournamentId: T, tournamentDivisionId: division, teamName: name,
    teamStatus: 'COMPLETE', isPaid: true, organizerWaivedFee: false, isMock: false,
    isWildcard: false, seed: null, customResponses: null, pairingSource: 'SYSTEM',
    partnerUserId: null, teamInviteToken: null, entryFeeAtRegistration: 0,
    __rosterCount: 2, ...over,
  };
}

const TWO_DIVISIONS: Row[] = [
  pairRow('Nam-1', DIV_A), pairRow('Nam-2', DIV_A),
  pairRow('Nữ-1', DIV_B), pairRow('Nữ-2', DIV_B),
];
const DIVISIONS_NAM_NU: Row[] = [divisionOf(DIV_A, 'Đôi Nam', null), divisionOf(DIV_B, 'Đôi Nữ', null)];
const GUEST_ENTRY = { importedFrom: 'ORGANIZER_DIRECT', player1Name: 'Khách A', player2Name: 'Khách B' };
const AUTO_PAIR = {
  message: 'Đã ghép 1 cặp thành công.',
  paired: [
    { participantId: 'pair-x', participant1Id: 'pair-x', participant2Id: 'pair-y', teamName: 'Ana / Binh', memberNames: ['Ana', 'Binh'] },
  ],
  unpairedParticipantIds: [],
  unpairedNames: [],
  strategy: 'RANDOM',
};

const liteTournament = (): Row => makeTournament({ isLite: true });

function setup(opts: {
  tournament?: Row;
  participants: Row[];
  divisions?: Row[];
  bracketFound?: unknown;
  stages?: Row[];
  matches?: Row[];
  litePair?: () => Promise<unknown>;
}) {
  const db = new FakeDb();
  const tournament = opts.tournament ?? makeTournament();
  const rosters = opts.participants.flatMap((p) =>
    Array.from({ length: Number(p.__rosterCount ?? 0) }, () => ({
      id: randomUUID(), participantId: p.id, userId: randomUUID(), role: 'MAIN',
    })),
  );
  db.seed(schema.tournaments, [tournament]);
  db.seed(schema.tournamentParticipants, opts.participants);
  db.seed(schema.tournamentRosters, rosters);
  db.seed(schema.tournamentStages, opts.stages ?? []);
  db.seed(schema.matches, opts.matches ?? []);
  const bracketRepo = new TournamentBracketRepository(
    db as unknown as BracketRepoDeps[0],
    null as unknown as BracketRepoDeps[1],
  );
  const repo = {
    findById: jest.fn(async () => tournament),
    getDivisionsByTournament: jest.fn(async () => opts.divisions ?? [divisionOf(DIV_A, 'Đôi A', null)]),
    findBracket: jest.fn(async () => opts.bracketFound ?? null),
    findParentById: jest.fn(async () => null),
    findCommunityMember: jest.fn(async () => null),
    generateLitePairsTx: jest.fn(
      opts.litePair ??
        (async () => {
          throw new BadRequestException(NO_PAIRABLE);
        }),
    ),
    findParticipantsForSeeding: (id: string, division?: string) =>
      bracketRepo.findParticipantsForSeeding(id, division),
  };
  const access = { isManager: jest.fn(async () => true) };
  const generator = new BracketGeneratorService(db as unknown as GeneratorDeps[0]);
  const service = new TournamentBracketService(
    repo as unknown as BracketServiceDeps[0],
    generator,
    access as unknown as BracketServiceDeps[2],
    null as unknown as BracketServiceDeps[3],
    null as unknown as BracketServiceDeps[4],
  );
  const names = new Map<string, string>(
    opts.participants.map((p): [string, string] => [String(p.id), String(p.teamName)]),
  );
  return { db, repo, service, generator, names };
}

function summarize(db: FakeDb, names: Map<string, string>) {
  const matches = db.inserted.get(schema.matches) ?? [];
  const r1 = matches.filter((m) => m.roundNumber === 1);
  const ids = r1.flatMap((m) => [m.participant1Id, m.participant2Id]).filter((id) => id != null);
  const teams = [...new Set(ids.map((id) => names.get(String(id))))];
  const stages = db.inserted.get(schema.tournamentStages) ?? [];
  return {
    round1Teams: teams,
    byeMatches: r1.filter((m) => m.isBye === true).length,
    stageDivision: stages[0]?.tournamentDivisionId ?? null,
  };
}

function round1Of(db: FakeDb): Row[] {
  return (db.inserted.get(schema.matches) ?? []).filter((m) => m.roundNumber === 1);
}

// Stage ids that a soft-delete WHERE clause matches (the fake does not apply updates).
function softDeletedStageIds(db: FakeDb): string[] {
  const stages = db.rowsOf(schema.tournamentStages);
  return db.updates
    .filter((u) => u.table === schema.tournamentStages)
    .flatMap((u) => stages.filter((s) => rowMatches(schema.tournamentStages, u.cond, s)).map((s) => String(s.id)));
}

const sorted = (xs: (string | undefined)[]) => [...xs].sort();

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

describe('TC-BRK bracket đôi (fake DB)', () => {
  describe('Chọn nội dung khi tạo sơ đồ (B3)', () => {
    it('TC-BRK-01 giải hai nội dung không truyền divisionId: 400, không ghi sơ đồ', async () => {
      const { db, service } = setup({ participants: TWO_DIVISIONS, divisions: DIVISIONS_NAM_NU });
      const err = await service
        .generateBracket(T, ORG, [], undefined, undefined, true)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(messageOf(err)).toBe(PICK_DIVISION);
      expect(db.inserted.get(schema.tournamentStages) ?? []).toHaveLength(0);
    });

    it('TC-BRK-02 giải lite hai nội dung không truyền divisionId: 400, không ghép tự động', async () => {
      const { db, repo, service } = setup({
        tournament: makeTournament({ isLite: true }),
        participants: TWO_DIVISIONS,
        divisions: DIVISIONS_NAM_NU,
      });
      const err = await service
        .generateBracket(T, ORG, [], undefined, undefined, true)
        .catch((e: unknown) => e);
      expect(messageOf(err)).toBe(PICK_DIVISION);
      expect(repo.generateLitePairsTx).not.toHaveBeenCalled();
      expect(db.inserted.get(schema.tournamentStages) ?? []).toHaveLength(0);
    });

    it('TC-BRK-03 giải một nội dung không truyền divisionId: dùng nội dung đó', async () => {
      const { db, service, names } = setup({
        participants: [pairRow('TK-TK', DIV_A), pairRow('Excel', DIV_A)],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
      });
      await service.generateBracket(T, ORG, [], undefined, undefined, true);
      const s = summarize(db, names);
      expect(sorted(s.round1Teams)).toEqual(['Excel', 'TK-TK']);
      expect(s.stageDivision).toBe(DIV_A);
    });

    it('TC-BRK-04 đã chọn nội dung: chỉ lấy VĐV và chỉ xoá mềm sơ đồ của nội dung đó', async () => {
      const { db, service, names } = setup({
        participants: TWO_DIVISIONS,
        divisions: DIVISIONS_NAM_NU,
        stages: [
          { id: 'stage-a', tournamentId: T, tournamentDivisionId: DIV_A, deletedAt: null },
          { id: 'stage-b', tournamentId: T, tournamentDivisionId: DIV_B, deletedAt: null },
        ],
      });
      await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      expect(sorted(summarize(db, names).round1Teams)).toEqual(['Nam-1', 'Nam-2']);
      expect(softDeletedStageIds(db)).toEqual(['stage-a']);
    });
  });

  describe('Điều kiện đội hợp lệ (mọi thể thức, B5/D3)', () => {
    const fourEligible: Row[] = [
      pairRow('TK-TK', DIV_A),
      pairRow('Excel', DIV_A, { pairingSource: 'MANUAL' }),
      pairRow('TK-khách', DIV_A, { isPaid: false, organizerWaivedFee: true, pairingSource: 'MANUAL' }),
      pairRow('khách-khách', DIV_A, {
        __rosterCount: 0, pairingSource: 'MANUAL', isPaid: false, organizerWaivedFee: true,
        customResponses: GUEST_ENTRY,
      }),
    ];

    it('TC-BRK-05 bốn cặp đã đóng hoặc BTC miễn phí: SE và GSK đều nhận đủ 4 cặp', async () => {
      const se = setup({ participants: fourEligible, divisions: [divisionOf(DIV_A, 'Đôi A', 'SINGLE_ELIMINATION')] });
      await se.service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      expect(sorted(summarize(se.db, se.names).round1Teams)).toEqual(
        sorted(['TK-TK', 'Excel', 'TK-khách', 'khách-khách']),
      );

      const gsk = setup({ participants: fourEligible, divisions: [divisionOf(DIV_A, 'Đôi A', 'GROUP_STAGE_KNOCKOUT')] });
      const spy = jest
        .spyOn(gsk.generator, 'generateGroupStageKnockout')
        .mockResolvedValue({ message: 'ok' } as never);
      const outcome = await gsk.service
        .generateBracket(T, ORG, [], DIV_A, undefined, true)
        .then(() => 'OK', (e: unknown) => messageOf(e));
      expect(outcome).toBe('OK');
      expect(spy).toHaveBeenCalled();
    });

    it('TC-BRK-06 cặp COMPLETE chưa đóng, chưa được BTC miễn, không phải VĐV ảo: không vào sơ đồ', async () => {
      const { db, service, names } = setup({
        participants: [
          pairRow('TK-TK', DIV_A),
          pairRow('Excel', DIV_A, { pairingSource: 'MANUAL' }),
          pairRow('TK-khách', DIV_A, { isPaid: false, pairingSource: 'MANUAL', entryFeeAtRegistration: 100000 }),
          pairRow('khách-khách', DIV_A, {
            __rosterCount: 0, pairingSource: 'MANUAL', isPaid: false, organizerWaivedFee: false,
            customResponses: GUEST_ENTRY, entryFeeAtRegistration: 100000,
          }),
        ],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
      });
      await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      expect(sorted(summarize(db, names).round1Teams)).toEqual(['Excel', 'TK-TK']);
    });

    it('TC-BRK-06b vòng bảng + loại trực tiếp đếm cặp đủ điều kiện và báo "cặp"', async () => {
      const { service } = setup({
        participants: [
          pairRow('TK-TK', DIV_A),
          pairRow('Excel', DIV_A),
          pairRow('TK-khách', DIV_A, { isPaid: false, entryFeeAtRegistration: 100000 }),
        ],
        divisions: [divisionOf(DIV_A, 'Đôi A', 'GROUP_STAGE_KNOCKOUT')],
      });
      const outcome = await service
        .generateBracket(T, ORG, [], DIV_A, undefined, true)
        .then(() => 'OK', (e: unknown) => messageOf(e));
      expect(outcome).toMatch(/Cần ít nhất 4 cặp/);
    });

    it('TC-BRK-06d mock đôi: mock đã ghép vào sơ đồ, mock đang chờ bị loại', async () => {
      const { db, service, names } = setup({
        participants: [
          pairRow('Mock đã ghép', DIV_A, { isMock: true, isPaid: false }),
          pairRow('Mock chờ', DIV_A, { isMock: true, isPaid: false, teamStatus: 'PENDING_PARTNER' }),
          pairRow('TK-TK', DIV_A),
          pairRow('TK-khách', DIV_A, { isPaid: false, organizerWaivedFee: true }),
        ],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
      });
      await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      expect(sorted(summarize(db, names).round1Teams)).toEqual(sorted(['Mock đã ghép', 'TK-TK', 'TK-khách']));
    });

    it('TC-BRK-06e ba cặp đủ điều kiện và một người còn chờ ghép: sơ đồ chỉ có ba cặp', async () => {
      const { db, service, names } = setup({
        participants: [
          pairRow('TK-TK', DIV_A),
          pairRow('TK-khách', DIV_A, { isPaid: false, organizerWaivedFee: true }),
          pairRow('Excel', DIV_A),
          pairRow('Lẻ-chờ-đối-tác', DIV_A, { teamStatus: 'PENDING_PARTNER', __rosterCount: 1 }),
        ],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
      });
      await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      expect(sorted(summarize(db, names).round1Teams)).toEqual(sorted(['TK-TK', 'TK-khách', 'Excel']));
    });

    it('TC-BRK-FREE-01 cặp đăng ký miễn phí (phí 0 hoặc rỗng) chưa có cờ đã đóng vẫn vào sơ đồ', async () => {
      const { db, service, names } = setup({
        participants: [
          pairRow('Miễn-phí-0', DIV_A, { isPaid: false, entryFeeAtRegistration: 0 }),
          pairRow('Miễn-phí-rỗng', DIV_A, { isPaid: false, entryFeeAtRegistration: null }),
          pairRow('Có-phí-chưa-đóng', DIV_A, { isPaid: false, entryFeeAtRegistration: 100000 }),
          pairRow('TK-TK', DIV_A),
        ],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
      });
      await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      expect(sorted(summarize(db, names).round1Teams)).toEqual(sorted(['Miễn-phí-0', 'Miễn-phí-rỗng', 'TK-TK']));
    });

    it('TC-BRK-07 nội dung đôi thiếu cặp: thông báo nói "cặp", không nói "đội"', async () => {
      const { service } = setup({
        participants: [
          pairRow('TK-TK', DIV_A),
          pairRow('Excel-chờ-duyệt', DIV_A, { teamStatus: 'PENDING_APPROVAL', pairingSource: 'MANUAL' }),
          pairRow('Lẻ-1', DIV_A, { teamStatus: 'PENDING_PARTNER', __rosterCount: 1 }),
          pairRow('Lẻ-2', DIV_A, { teamStatus: 'PENDING_PARTNER', __rosterCount: 1 }),
        ],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
      });
      const outcome = await service
        .generateBracket(T, ORG, [], DIV_A, undefined, true)
        .then(() => 'OK', (e: unknown) => messageOf(e));
      expect(outcome).toMatch(/Cần ít nhất 2 cặp/);
    });

    it('TC-BRK-07b nội dung đơn thiếu đội: thông báo nói "đội"', async () => {
      const { service } = setup({
        participants: [pairRow('VĐV-1', DIV_A, { __rosterCount: 1 })],
        divisions: [divisionOf(DIV_A, 'Đơn A', null, 'SINGLES')],
      });
      const outcome = await service
        .generateBracket(T, ORG, [], DIV_A, undefined, true)
        .then(() => 'OK', (e: unknown) => messageOf(e));
      expect(outcome).toMatch(/Cần ít nhất 2 đội/);
    });
  });

  describe('Tự ghép khi tạo sơ đồ đôi lite (D2)', () => {
    it('TC-BRK-08 ghép ngẫu nhiên đúng nội dung được gọi và trả về danh sách đã ghép', async () => {
      const { repo, service } = setup({
        tournament: liteTournament(),
        participants: [pairRow('TK-TK', DIV_A), pairRow('Excel', DIV_A)],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
        litePair: async () => AUTO_PAIR,
      });
      const res = await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      expect(repo.generateLitePairsTx).toHaveBeenCalledWith(T, ORG, 'RANDOM', DIV_A);
      expect(res).toMatchObject({
        autoPaired: [{ participantId: 'pair-x', memberNames: ['Ana', 'Binh'] }],
        unpairedNames: [],
      });
    });

    it('TC-BRK-08b giải lite đơn không gọi ghép đôi', async () => {
      const { repo, service } = setup({
        tournament: { ...liteTournament(), matchType: 'SINGLES' },
        participants: [pairRow('TK-TK', DIV_A), pairRow('Excel', DIV_A)],
        divisions: [divisionOf(DIV_A, 'Đơn A', null, 'SINGLES')],
      });
      await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      expect(repo.generateLitePairsTx).not.toHaveBeenCalled();
    });

    it('TC-BRK-09 không còn ai để ghép: bỏ qua lỗi đó và vẫn tạo sơ đồ', async () => {
      const { db, service, names } = setup({
        tournament: liteTournament(),
        participants: [pairRow('TK-TK', DIV_A), pairRow('Excel', DIV_A)],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
      });
      const res = await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      expect(sorted(summarize(db, names).round1Teams)).toEqual(['Excel', 'TK-TK']);
      expect(res).not.toHaveProperty('autoPaired');
    });

    it('TC-BRK-09b lỗi ghép khác không bị nuốt: ném ra và không ghi sơ đồ', async () => {
      const { db, service } = setup({
        tournament: liteTournament(),
        participants: [pairRow('TK-TK', DIV_A), pairRow('Excel', DIV_A)],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
        litePair: async () => {
          throw new Error('mất kết nối cơ sở dữ liệu');
        },
      });
      await expect(service.generateBracket(T, ORG, [], DIV_A, undefined, true)).rejects.toThrow(
        'mất kết nối cơ sở dữ liệu',
      );
      expect(db.inserted.get(schema.tournamentStages) ?? []).toHaveLength(0);
    });

    it('TC-BRK-10 người lẻ được báo trong response', async () => {
      const { service } = setup({
        tournament: liteTournament(),
        participants: [pairRow('TK-TK', DIV_A), pairRow('Excel', DIV_A)],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
        litePair: async () => ({ ...AUTO_PAIR, unpairedParticipantIds: ['le-1'], unpairedNames: ['Lẻ Một'] }),
      });
      const res = await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      expect(res).toMatchObject({ unpairedNames: ['Lẻ Một'] });
    });
  });

  describe('Tạo lại và khoá sơ đồ (B6)', () => {
    it('TC-BRK-11 endpoint generate-bracket không gửi allowReset: service nhận false', async () => {
      const service = { generateBracket: jest.fn(async () => ({ message: 'ok' })) };
      const controller = new TournamentsController(service as never, {} as never);
      await controller.generateBracket(T, DIV_A, undefined, undefined, { sub: ORG, roles: ['ORGANIZER'] } as never);
      expect(service.generateBracket).toHaveBeenCalledWith(T, ORG, ['ORGANIZER'], DIV_A, undefined, false);
    });

    it('TC-BRK-11b endpoint generate-bracket gửi allowReset=true thì service nhận true', async () => {
      const service = { generateBracket: jest.fn(async () => ({ message: 'ok' })) };
      const controller = new TournamentsController(service as never, {} as never);
      await controller.generateBracket(T, DIV_A, undefined, true, { sub: ORG, roles: ['ORGANIZER'] } as never);
      expect(service.generateBracket).toHaveBeenCalledWith(T, ORG, ['ORGANIZER'], DIV_A, undefined, true);
    });

    it('TC-BRK-12 đã chốt sau khi đóng đăng ký: không cho tạo lại khi allowReset=false', async () => {
      const { service } = setup({
        participants: [pairRow('TK-TK', DIV_A), pairRow('Excel', DIV_A)],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
        bracketFound: { stages: [{ id: 'old-stage' }] },
      });
      await expect(service.generateBracket(T, ORG, [], DIV_A, undefined, false)).rejects.toThrow(/đã được chốt/);
    });

    it('TC-BRK-12b đã chốt nhưng allowReset=true và chưa có trận bắt đầu: tạo lại được', async () => {
      const { db, service } = setup({
        participants: [pairRow('TK-TK', DIV_A), pairRow('Excel', DIV_A)],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
        bracketFound: { stages: [{ id: 'old-stage' }] },
        stages: [{ id: 'old-stage', tournamentId: T, tournamentDivisionId: DIV_A, deletedAt: null }],
      });
      await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      expect(softDeletedStageIds(db)).toEqual(['old-stage']);
    });

    it('TC-BRK-13 có trận đã bắt đầu: không xoá sơ đồ cũ dù allowReset=true', async () => {
      const { db, service } = setup({
        participants: [pairRow('TK-TK', DIV_A), pairRow('Excel', DIV_A)],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
        stages: [{ id: 'stage-a', tournamentId: T, tournamentDivisionId: DIV_A, deletedAt: null }],
        matches: [{ id: 'm1', stageId: 'stage-a', status: 'COMPLETED', roundNumber: 1 }],
      });
      await expect(service.generateBracket(T, ORG, [], DIV_A, undefined, true)).rejects.toThrow(/đã bắt đầu/);
      expect(softDeletedStageIds(db)).toEqual([]);
      expect(db.inserted.get(schema.tournamentStages) ?? []).toHaveLength(0);
    });

    it('TC-BRK-13b trận chưa bắt đầu (SCHEDULED) không chặn tạo lại', async () => {
      const { db, service } = setup({
        participants: [pairRow('TK-TK', DIV_A), pairRow('Excel', DIV_A)],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
        stages: [{ id: 'stage-a', tournamentId: T, tournamentDivisionId: DIV_A, deletedAt: null }],
        matches: [{ id: 'm1', stageId: 'stage-a', status: 'SCHEDULED', roundNumber: 1 }],
      });
      await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      expect(softDeletedStageIds(db)).toEqual(['stage-a']);
    });

    it('TC-BRK-14 khoá hàng giải (FOR UPDATE) trước khi xoá mềm sơ đồ cũ', async () => {
      const { db, service } = setup({
        participants: [pairRow('TK-TK', DIV_A), pairRow('Excel', DIV_A)],
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
        stages: [{ id: 'stage-a', tournamentId: T, tournamentDivisionId: DIV_A, deletedAt: null }],
      });
      await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      const lockAt = db.events.indexOf(`lock:${getTableName(schema.tournaments)}:update`);
      const softDeleteAt = db.events.indexOf(`update:${getTableName(schema.tournamentStages)}`);
      expect(lockAt).toBeGreaterThanOrEqual(0);
      expect(softDeleteAt).toBeGreaterThan(lockAt);
    });
  });

  describe('Hai lượt (B7)', () => {
    it('TC-BRK-15 bốn đội hai lượt: cả 4 đội ở vòng 1, mỗi cặp hai lượt đối xứng và đều đã xếp', async () => {
      const { db, service, names } = setup({
        tournament: makeTournament({ twoLegged: true }),
        participants: ['P1', 'P2', 'P3', 'P4'].map((n) => pairRow(n, DIV_A)),
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
      });
      await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      const s = summarize(db, names);
      expect(sorted(s.round1Teams)).toEqual(['P1', 'P2', 'P3', 'P4']);
      expect(s.byeMatches).toBe(0);
      const r1 = round1Of(db);
      expect(r1).toHaveLength(4);
      for (let tie = 0; tie < 2; tie++) {
        const leg1 = r1[2 * tie];
        const leg2 = r1[2 * tie + 1];
        expect(leg2.participant1Id).toBe(leg1.participant2Id);
        expect(leg2.participant2Id).toBe(leg1.participant1Id);
        expect(leg1.status).toBe('SCHEDULED');
        expect(leg2.status).toBe('SCHEDULED');
      }
    });

    it('TC-BRK-16 ba đội hai lượt: tie có một đội là BYE ở cả hai lượt, tie còn lại có hai lượt đấu', async () => {
      const { db, service, names } = setup({
        tournament: makeTournament({ twoLegged: true }),
        participants: ['P1', 'P2', 'P3'].map((n) => pairRow(n, DIV_A)),
        divisions: [divisionOf(DIV_A, 'Đôi A', null)],
      });
      await service.generateBracket(T, ORG, [], DIV_A, undefined, true);
      expect(sorted(summarize(db, names).round1Teams)).toEqual(['P1', 'P2', 'P3']);
      const r1 = round1Of(db);
      const byes = r1.filter((m) => m.isBye === true);
      const plays = r1.filter((m) => m.isBye !== true);
      expect(byes).toHaveLength(2);
      expect(plays).toHaveLength(2);
      byes.forEach((m) => expect(m.winnerId).not.toBeNull());
      plays.forEach((m) => expect(m.status).toBe('SCHEDULED'));
    });
  });

  describe('Thể thức chưa hỗ trợ', () => {
    it('TC-BRK-17 GROUP_STAGE_THEN_KNOCKOUT: 400 nêu tên thể thức, không rơi về loại trực tiếp', async () => {
      const { db, service } = setup({
        participants: [pairRow('TK-TK', DIV_A), pairRow('Excel', DIV_A), pairRow('Khác', DIV_A), pairRow('Khác 2', DIV_A)],
        divisions: [divisionOf(DIV_A, 'Đôi A', 'GROUP_STAGE_THEN_KNOCKOUT')],
      });
      await expect(service.generateBracket(T, ORG, [], DIV_A, undefined, true)).rejects.toThrow(
        /GROUP_STAGE_THEN_KNOCKOUT/,
      );
      expect(db.inserted.get(schema.tournamentStages) ?? []).toHaveLength(0);
    });
  });

  describe('Chốt giải có nhiều nội dung (B3)', () => {
    it('TC-BRK-18 chốt giải hai nội dung: sinh sơ đồ riêng cho từng nội dung, không trộn VĐV', async () => {
      const { db, service, names } = setup({ participants: TWO_DIVISIONS, divisions: DIVISIONS_NAM_NU });
      await service.generateBracketForEachDivision(T, ORG, []);
      const stages = db.inserted.get(schema.tournamentStages) ?? [];
      expect(stages.map((s) => String(s.tournamentDivisionId)).sort()).toEqual([DIV_A, DIV_B]);
      const stageDivision = new Map(stages.map((s) => [String(s.id), String(s.tournamentDivisionId)]));
      const teamsOf = (division: string) =>
        sorted(
          round1Of(db)
            .filter((m) => stageDivision.get(String(m.stageId)) === division)
            .flatMap((m) => [m.participant1Id, m.participant2Id])
            .filter((id) => id != null)
            .map((id) => names.get(String(id))),
        );
      expect(teamsOf(DIV_A)).toEqual(['Nam-1', 'Nam-2']);
      expect(teamsOf(DIV_B)).toEqual(['Nữ-1', 'Nữ-2']);
    });
  });
});
