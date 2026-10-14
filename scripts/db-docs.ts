/**
 * Sinh docs/schema/README.md: bản đồ database theo nhóm nghiệp vụ (mỗi file *.schema.ts là một nhóm),
 * kèm sơ đồ quan hệ Mermaid từng nhóm và audit nhẹ (khóa ngoại thiếu index, bảng thiếu mô tả, bảng thiếu khóa chính).
 * Mô tả bảng lấy từ comment JSDoc đặt ngay trên `export const x = pgTable(...)`.
 *
 * Chạy:   npm run db:docs          (ghi lại file)
 *         npm run db:docs:check    (exit 1 nếu file đang lệch so với schema)
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_DIR = path.join(ROOT, 'src/database/schema');
const OUT_DIR = path.join(ROOT, 'docs/schema');

interface TableDoc {
  name: string;
  domain: string;
  description: string;
  hasPrimaryKey: boolean;
  foreignKeys: { columns: string[]; table: string; nullable: boolean }[];
  unindexedFks: string[];
}

/** Đọc mô tả JSDoc của từng `pgTable` trong file: tên bảng DB -> dòng mô tả đầu tiên. */
function readTableDescriptions(file: string): Map<string, string> {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const result = new Map<string, string>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      const init = declaration.initializer;
      if (!init || !ts.isCallExpression(init) || !init.expression.getText(source).endsWith('pgTable')) continue;
      const [nameArg] = init.arguments;
      if (!nameArg || !ts.isStringLiteral(nameArg)) continue;
      // Với khai báo biến, TS gắn JSDoc của cả câu lệnh `export const` vào declaration.
      const jsDoc = ts.getJSDocCommentsAndTags(declaration).filter(ts.isJSDoc).at(-1);
      const text = jsDoc ? ts.getTextOfJSDocComment(jsDoc.comment) ?? '' : '';
      result.set(nameArg.text, text.split(/\r?\n/)[0].trim());
    }
  }
  return result;
}

/** Cột FK được coi là có index khi là cột đầu của một index, khóa chính hoặc ràng buộc unique. */
function leadingIndexedColumns(table: PgTable): string[][] {
  const config = getTableConfig(table);
  const leading: string[][] = [];
  const names = (columns: unknown[]) =>
    columns.flatMap(column =>
      column && typeof column === 'object' && 'name' in column && typeof column.name === 'string' ? [column.name] : []);
  for (const index of config.indexes) leading.push(names(index.config.columns));
  for (const pk of config.primaryKeys) leading.push(names(pk.columns));
  for (const unique of config.uniqueConstraints) leading.push(names(unique.columns));
  for (const column of config.columns) if (column.primary || column.isUnique) leading.push([column.name]);
  return leading;
}

function collectTables(): TableDoc[] {
  const files = fs.readdirSync(SCHEMA_DIR).filter(file => file.endsWith('.schema.ts')).sort();
  const tables: TableDoc[] = [];
  for (const file of files) {
    const fullPath = path.join(SCHEMA_DIR, file);
    const domain = file.replace(/\.schema\.ts$/, '');
    const descriptions = readTableDescriptions(fullPath);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exported = require(fullPath) as Record<string, unknown>;
    for (const value of Object.values(exported)) {
      if (!is(value, PgTable)) continue;
      const config = getTableConfig(value);
      const leading = leadingIndexedColumns(value);
      const foreignKeys = config.foreignKeys.map(fk => {
        const reference = fk.reference();
        const columns = reference.columns.map(column => column.name);
        return {
          columns,
          table: getTableConfig(reference.foreignTable).name,
          nullable: reference.columns.some(column => !column.notNull)
        };
      });
      const unindexedFks = foreignKeys
        .filter(fk => !leading.some(index => fk.columns.every((column, i) => index[i] === column)))
        .map(fk => `${fk.columns.join(', ')} → ${fk.table}`);
      tables.push({
        name: config.name,
        domain,
        description: descriptions.get(config.name) ?? '',
        hasPrimaryKey: config.primaryKeys.length > 0 || config.columns.some(column => column.primary),
        foreignKeys,
        unindexedFks
      });
    }
  }
  return tables;
}

const GENERATED_NOTE = '> Tự sinh bởi `npm run db:docs` từ `src/database/schema/*.schema.ts`, không sửa tay. Kiểm tra còn khớp schema: `npm run db:docs:check`.';

/** README: bản đồ ngắn đọc đầu phiên. relations.md: sơ đồ quan hệ từng nhóm. audit.md: vấn đề cần xử lý. */
function render(tables: TableDoc[]): Record<string, string> {
  const domains = [...new Set(tables.map(table => table.domain))];
  const fkCount = tables.reduce((sum, table) => sum + table.foreignKeys.length, 0);
  const described = tables.filter(table => table.description).length;
  const unindexed = tables.flatMap(table => table.unindexedFks.map(fk => `\`${table.name}\`: ${fk}`));
  const missingDescription = tables.filter(table => !table.description).map(table => `\`${table.name}\``);
  const missingPk = tables.filter(table => !table.hasPrimaryKey).map(table => `\`${table.name}\``);

  const readme: string[] = [
    '# Bản đồ database',
    '',
    GENERATED_NOTE,
    '',
    `${tables.length} bảng · ${fkCount} khóa ngoại · ${domains.length} nhóm nghiệp vụ (mỗi file \`src/database/schema/<nhóm>.schema.ts\` là một nhóm) · ${described}/${tables.length} bảng có mô tả.`,
    '',
    '- Cột, kiểu, mô tả từng cột: mở file schema của nhóm (JSDoc nằm ngay trên bảng/cột).',
    `- Quan hệ khóa ngoại từng nhóm (Mermaid): [relations.md](./relations.md).`,
    `- Audit: [audit.md](./audit.md) (${unindexed.length} khóa ngoại chưa có index, ${missingPk.length} bảng thiếu khóa chính, ${missingDescription.length} bảng chưa có mô tả).`,
    ''
  ];
  const relations: string[] = ['# Quan hệ khóa ngoại theo nhóm', '', GENERATED_NOTE, '', 'Mỗi cạnh: `bảng cha --o{ bảng con : cột FK`; `|o` là FK cho phép null.', ''];
  for (const domain of domains) {
    const domainTables = tables.filter(table => table.domain === domain);
    readme.push(`## ${domain}`, '');
    for (const table of domainTables) readme.push(`- \`${table.name}\`${table.description ? `: ${table.description}` : ''}`);
    readme.push('');

    const edges = domainTables.flatMap(table => table.foreignKeys.map(fk =>
      `  ${fk.table} ${fk.nullable ? '|o' : '||'}--o{ ${table.name} : "${fk.columns.join(', ')}"`));
    if (edges.length) relations.push(`## ${domain}`, '', '```mermaid', 'erDiagram', ...edges, '```', '');
  }

  const audit = [
    '# Audit schema',
    '',
    GENERATED_NOTE,
    '',
    `## Khóa ngoại chưa có index (${unindexed.length} ứng viên)`,
    '',
    'Danh sách lấy từ metadata schema, không phải lỗi hiệu năng đã đo. Thiếu index thì JOIN/lọc/xóa theo cột FK có thể phải đọc nhiều dòng của bảng con. Chỉ thêm index khi bảng con lớn hoặc truy vấn thật hay dùng cột đó; xác nhận bằng EXPLAIN (ví dụ tool `sql_sandbox`).',
    '',
    ...(unindexed.length ? unindexed.map(item => `- ${item}`) : ['Không có.']),
    '',
    `## Bảng chưa có khóa chính (${missingPk.length})`,
    '',
    missingPk.length ? missingPk.join(', ') : 'Không có.',
    '',
    `## Bảng chưa có mô tả nghiệp vụ (${missingDescription.length})`,
    '',
    missingDescription.length ? missingDescription.join(', ') : 'Không có.',
    ''
  ];
  return { 'README.md': readme.join('\n'), 'relations.md': relations.join('\n'), 'audit.md': audit.join('\n') };
}

function main(): void {
  const files = render(collectTables());
  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([name, content]) => {
      const file = path.join(OUT_DIR, name);
      return !fs.existsSync(file) || fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== content;
    });
    if (stale.length) {
      console.error(`docs/schema đã lệch so với schema (${stale.map(([name]) => name).join(', ')}). Chạy \`npm run db:docs\` rồi commit.`);
      process.exit(1);
    }
    console.log('docs/schema khớp schema.');
    return;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(OUT_DIR, name), content, 'utf8');
    console.log(`Đã ghi docs/schema/${name} (${Buffer.byteLength(content)} bytes).`);
  }
}

main();
