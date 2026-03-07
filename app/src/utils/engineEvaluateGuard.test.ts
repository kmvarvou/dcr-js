import { describe, it, expect } from 'vitest';
// Import directly from engine source — not re-exported via index.ts
import { evaluateGuard } from '../../../dcr-engine/src/executionEngine';

// ---------------------------------------------------------------------------
// Bool literal parsing (the core bug fix: "test = false" with boolean false)
// ---------------------------------------------------------------------------
describe('engine evaluateGuard – Bool literals', () => {
    it('flag = false passes when flag is boolean false', () => {
        expect(evaluateGuard('flag = false', { flag: false })).toBe(true);
    });

    it('flag = true passes when flag is boolean true', () => {
        expect(evaluateGuard('flag = true', { flag: true })).toBe(true);
    });

    it('flag = false fails when flag is boolean true', () => {
        expect(evaluateGuard('flag = false', { flag: true })).toBe(false);
    });

    it('flag = true fails when flag is boolean false', () => {
        expect(evaluateGuard('flag = true', { flag: false })).toBe(false);
    });

    it('flag != false passes when flag is boolean true', () => {
        expect(evaluateGuard('flag != false', { flag: true })).toBe(true);
    });

    it('flag != true passes when flag is boolean false', () => {
        expect(evaluateGuard('flag != true', { flag: false })).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Fail-closed: variable absent from store → false
// ---------------------------------------------------------------------------
describe('engine evaluateGuard – fail-closed behaviour', () => {
    it('returns false when variable is not in store', () => {
        expect(evaluateGuard('flag = false', {})).toBe(false);
    });

    it('returns false when store is empty', () => {
        expect(evaluateGuard('x > 5', {})).toBe(false);
    });

    it('returns true for empty/undefined expression', () => {
        expect(evaluateGuard(undefined, {})).toBe(true);
        expect(evaluateGuard('', {})).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Int comparisons still work (regression guard)
// ---------------------------------------------------------------------------
describe('engine evaluateGuard – Int comparisons', () => {
    it('x = 5 passes when x is 5', () => {
        expect(evaluateGuard('x = 5', { x: 5 })).toBe(true);
    });

    it('x = 5 fails when x is 6', () => {
        expect(evaluateGuard('x = 5', { x: 6 })).toBe(false);
    });

    it('x > 5 passes when x is 10', () => {
        expect(evaluateGuard('x > 5', { x: 10 })).toBe(true);
    });

    it('x > 5 fails when x is 3', () => {
        expect(evaluateGuard('x > 5', { x: 3 })).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// String comparisons
// ---------------------------------------------------------------------------
describe('engine evaluateGuard – String comparisons', () => {
    it('status = "active" passes when status matches', () => {
        expect(evaluateGuard('status = "active"', { status: 'active' })).toBe(true);
    });

    it('status = "active" fails when status does not match', () => {
        expect(evaluateGuard('status = "active"', { status: 'inactive' })).toBe(false);
    });
});
