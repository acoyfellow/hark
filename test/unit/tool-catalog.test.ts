import { describe, expect, it } from 'vitest';
import { TOOL_CATALOG } from '../../shared/tool-catalog';
import { TOOLS } from '../../src/tools';

describe('the tools page lists exactly what the agent can do', () => {
  it('has one entry for every built-in tool and none that do not exist', () => {
    expect(TOOL_CATALOG.map((tool) => tool.name).toSorted()).toEqual(TOOLS.map((tool) => tool.name).toSorted());
  });
});
