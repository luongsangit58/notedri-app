import { describeProgressStage } from '../progressText';

describe('describeProgressStage', () => {
  it('defaults to a thinking message when no stage yet', () => {
    expect(describeProgressStage(null)).toContain('suy nghĩ');
  });

  it('describes the thinking phase', () => {
    expect(describeProgressStage({ phase: 'thinking' })).toContain('suy nghĩ');
  });

  it('describes a vehicle/knowledge tool call as reading vehicle data', () => {
    expect(describeProgressStage({ phase: 'calling_tool', toolNames: ['vehicle.getSpeed'] })).toContain('dữ liệu xe');
    expect(describeProgressStage({ phase: 'calling_tool', toolNames: ['knowledge.explainDTC'] })).toContain('dữ liệu xe');
  });

  it('describes a mutating tool call as preparing to write data', () => {
    expect(describeProgressStage({ phase: 'calling_tool', toolNames: ['odometer.create'] })).toContain('ghi dữ liệu');
  });

  it('describes a nearby-search tool call as finding a location', () => {
    expect(describeProgressStage({ phase: 'calling_tool', toolNames: ['fuel.findNearbyStations'] })).toContain('vị trí');
  });

  it('falls back to a generic lookup message for other tools', () => {
    expect(describeProgressStage({ phase: 'calling_tool', toolNames: ['expense.summary'] })).toContain('tra cứu');
  });
});
