import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveObjectiveCategoryKind, getObjectiveCategoryLabel } from '../public/src/screens/Metas.js';

test('savings goals use savings category options and specific label', () => {
  assert.equal(resolveObjectiveCategoryKind('savings_goal'), 'savings');
  assert.equal(getObjectiveCategoryLabel('savings_goal'), 'Categoria de Poupança (opcional)');
});

test('monthly cap goals keep expense category options and standard label', () => {
  assert.equal(resolveObjectiveCategoryKind('budget_cap'), 'expense');
  assert.equal(getObjectiveCategoryLabel('budget_cap'), 'Categoria (opcional)');
});
