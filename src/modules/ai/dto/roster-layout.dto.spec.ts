import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RosterLayoutRequestDto } from './roster-layout.dto';

const validBody = () => ({
  sheets: [{ name: 'Danh sách', rowCount: 3, columnCount: 2, rows: [{ r: 1, cells: ['A', 'B'] }] }],
});

const errorsFor = (body: Record<string, unknown>) =>
  validate(plainToInstance(RosterLayoutRequestDto, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('RosterLayoutRequestDto retryReason', () => {
  it('stays valid without it, so a first attempt and a released client are unchanged', async () => {
    expect(await errorsFor(validBody())).toHaveLength(0);
  });

  it('accepts EMPTY_LAYOUT, the one reason the web sends on its single retry', async () => {
    expect(await errorsFor({ ...validBody(), retryReason: 'EMPTY_LAYOUT' })).toHaveLength(0);
  });

  it('rejects any other reason, so the log field cannot carry free text', async () => {
    const errors = await errorsFor({ ...validBody(), retryReason: 'Nguyễn Văn Thử' });

    expect(errors.map((error) => error.property)).toContain('retryReason');
  });
});
