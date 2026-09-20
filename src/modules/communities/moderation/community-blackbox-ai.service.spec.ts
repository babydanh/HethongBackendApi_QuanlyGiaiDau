import { CommunityBlackboxAiService } from './community-blackbox-ai.service';

const SAFE_JSON = JSON.stringify({
  isSafe: true,
  riskScore: 0,
  flaggedCategory: 'NONE',
  reasonVi: '',
  reasonEn: '',
});

describe('CommunityBlackboxAiService vision routing', () => {
  const createConfig = (visionModelName = 'vision-model') => ({
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        'ai.apiKey': 'test-key',
        'ai.baseUrl': 'https://openrouter.ai/api/v1',
        'ai.modelName': 'text-model',
        'ai.visionModelName': visionModelName,
      };
      return values[key];
    }),
  });

  const attachProvider = (service: CommunityBlackboxAiService) => {
    const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: SAFE_JSON } }] });
    (service as unknown as { openai: unknown }).openai = { chat: { completions: { create } } };
    return create;
  };

  it('sends allowlisted image URLs as vision content and selects the vision model', async () => {
    const service = new CommunityBlackboxAiService(createConfig());
    const create = attachProvider(service);

    await expect(
      service.evaluatePost('Tìm người chơi', { communityName: 'CLB SportO' }, [
        'https://res.cloudinary.com/example/image/upload/post.jpg',
      ]),
    ).resolves.toMatchObject({ isSafe: true, isFallback: false });

    const request = create.mock.calls[0][0];
    expect(request.model).toBe('vision-model');
    expect(request.temperature).toBe(0);
    expect(request.max_tokens).toBe(160);
    expect(request.messages[1].content).toEqual([
      expect.objectContaining({ type: 'text' }),
      {
        type: 'image_url',
        image_url: {
          url: 'https://res.cloudinary.com/example/image/upload/post.jpg',
          detail: 'low',
        },
      },
    ]);
  });

  it('fails closed when image moderation has no configured vision model', async () => {
    const service = new CommunityBlackboxAiService(createConfig(''));
    const create = attachProvider(service);

    await expect(
      service.evaluatePost('', undefined, ['https://res.cloudinary.com/example/image/upload/post.jpg']),
    ).resolves.toMatchObject({ isSafe: true, isFallback: true });
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps text-only moderation on the text model', async () => {
    const service = new CommunityBlackboxAiService(createConfig());
    const create = attachProvider(service);

    await service.evaluatePost('inbox để trao đổi');

    const request = create.mock.calls[0][0];
    expect(request.model).toBe('text-model');
    expect(typeof request.messages[1].content).toBe('string');
    expect(request.messages[1].content).toContain('<post>inbox để trao đổi</post>');
  });

  it('caps the post text sent to the provider', async () => {
    const service = new CommunityBlackboxAiService(createConfig());
    const create = attachProvider(service);

    await service.evaluatePost('x'.repeat(2000));

    const request = create.mock.calls[0][0];
    expect((request.messages[1].content as string).length).toBeLessThan(1400);
    expect(request.messages[1].content).toContain(`<post>${'x'.repeat(1200)}</post>`);
  });
});
