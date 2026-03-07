import { describe, it, expect } from 'vitest';
import { evaluateGuard } from './evaluateGuard';

// ---------------------------------------------------------------------------
// Numeric comparisons
// ---------------------------------------------------------------------------
describe('evaluateGuard – numeric comparisons', () => {
    it('> passes when value is greater', () => {
        expect(evaluateGuard('x > 5', { x: 10 })).toBe(true);
    });
    it('> fails when value is equal', () => {
        expect(evaluateGuard('x > 5', { x: 5 })).toBe(false);
    });
    it('> fails when value is less', () => {
        expect(evaluateGuard('x > 5', { x: 3 })).toBe(false);
    });

    it('< passes when value is less', () => {
        expect(evaluateGuard('x < 5', { x: 3 })).toBe(true);
    });
    it('< fails when value equals threshold', () => {
        expect(evaluateGuard('x < 5', { x: 5 })).toBe(false);
    });

    it('>= passes when value equals threshold', () => {
        expect(evaluateGuard('x >= 5', { x: 5 })).toBe(true);
    });
    it('>= passes when value exceeds threshold', () => {
        expect(evaluateGuard('x >= 5', { x: 6 })).toBe(true);
    });
    it('>= fails when value is below threshold', () => {
        expect(evaluateGuard('x >= 5', { x: 4 })).toBe(false);
    });

    it('<= passes when value equals threshold', () => {
        expect(evaluateGuard('x <= 5', { x: 5 })).toBe(true);
    });
    it('<= fails when value exceeds threshold', () => {
        expect(evaluateGuard('x <= 5', { x: 6 })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Equality / inequality (FEEL uses single = and !=)
// ---------------------------------------------------------------------------
describe('evaluateGuard – equality operators', () => {
    it('= passes when equal (numeric)', () => {
        expect(evaluateGuard('x = 5', { x: 5 })).toBe(true);
    });
    it('= fails when not equal (numeric)', () => {
        expect(evaluateGuard('x = 5', { x: 6 })).toBe(false);
    });

    it('!= passes when not equal', () => {
        expect(evaluateGuard('x != 5', { x: 6 })).toBe(true);
    });
    it('!= fails when equal', () => {
        expect(evaluateGuard('x != 5', { x: 5 })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Boolean operators: and, or, not()
// ---------------------------------------------------------------------------
describe('evaluateGuard – boolean operators', () => {
    it('and passes when both sides are true', () => {
        expect(evaluateGuard('x > 1 and y < 10', { x: 5, y: 5 })).toBe(true);
    });
    it('and fails when right side is false', () => {
        expect(evaluateGuard('x > 1 and y < 10', { x: 5, y: 15 })).toBe(false);
    });
    it('and fails when left side is false', () => {
        expect(evaluateGuard('x > 1 and y < 10', { x: 0, y: 5 })).toBe(false);
    });

    it('or passes when only left side is true', () => {
        expect(evaluateGuard('x > 5 or y > 5', { x: 10, y: 0 })).toBe(true);
    });
    it('or passes when only right side is true', () => {
        expect(evaluateGuard('x > 5 or y > 5', { x: 0, y: 10 })).toBe(true);
    });
    it('or fails when both sides are false', () => {
        expect(evaluateGuard('x > 5 or y > 5', { x: 1, y: 1 })).toBe(false);
    });

    it('not() inverts a false condition to true', () => {
        expect(evaluateGuard('not(x > 5)', { x: 3 })).toBe(true);
    });
    it('not() inverts a true condition to false', () => {
        expect(evaluateGuard('not(x > 5)', { x: 10 })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Boolean literals and boolean variables
// ---------------------------------------------------------------------------
describe('evaluateGuard – booleans', () => {
    it('literal true always passes', () => {
        expect(evaluateGuard('true', {})).toBe(true);
    });
    it('literal false always fails', () => {
        expect(evaluateGuard('false', {})).toBe(false);
    });

    it('boolean variable true passes equality', () => {
        expect(evaluateGuard('flag = true', { flag: true })).toBe(true);
    });
    it('boolean variable false passes equality with false', () => {
        expect(evaluateGuard('flag = false', { flag: false })).toBe(true);
    });
    it('boolean variable false fails equality with true', () => {
        expect(evaluateGuard('flag = true', { flag: false })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// String variables
// ---------------------------------------------------------------------------
describe('evaluateGuard – string variables', () => {
    it('passes when string matches', () => {
        expect(evaluateGuard('status = "active"', { status: 'active' })).toBe(true);
    });
    it('fails when string does not match', () => {
        expect(evaluateGuard('status = "active"', { status: 'inactive' })).toBe(false);
    });
    it('!= passes when strings differ', () => {
        expect(evaluateGuard('status != "active"', { status: 'pending' })).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Fail-open behaviour
// ---------------------------------------------------------------------------
describe('evaluateGuard – fail-open', () => {
    it('returns true when variable is missing from store', () => {
        expect(evaluateGuard('Amount > 5', {})).toBe(true);
    });
    it('returns true for completely malformed expression', () => {
        expect(evaluateGuard('this is not valid!!!', {})).toBe(true);
    });
    it('returns true for empty expression', () => {
        expect(evaluateGuard('', {})).toBe(true);
    });

    // The exact bug scenario from the session: Amount=2, guard "Amount > 5" must be false
    it('correctly evaluates Amount > 5 as false when Amount=2', () => {
        expect(evaluateGuard('Amount > 5', { Amount: 2 })).toBe(false);
    });
    it('correctly evaluates Amount > 5 as true when Amount=10', () => {
        expect(evaluateGuard('Amount > 5', { Amount: 10 })).toBe(true);
    });
});
