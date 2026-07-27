import { ToolDefinition } from '../types';
import { KnowledgeClient } from '../KnowledgeClient';

/** knowledge.explainDTC(code) (docs/nori-agent-plan.md mục 6) - tool riêng, không gộp vào readDTC. */
export function buildKnowledgeTools(): ToolDefinition[] {
  return [
    {
      name: 'knowledge.explainDTC',
      description: 'Giải nghĩa 1 mã lỗi DTC (vd "P0301"): mức độ nghiêm trọng, có lái tiếp được không, chi phí sửa ước tính.',
      authority: 'read-only',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Mã DTC, vd P0301 hoặc 0301' },
        },
        required: ['code'],
        additionalProperties: false,
      },
      async execute(input) {
        const code = String(input.code ?? '');
        if (!code) return { status: 'unavailable', reason: 'missing_code' };
        return { status: 'ok', ...KnowledgeClient.explainDTC(code) };
      },
    },
  ];
}
