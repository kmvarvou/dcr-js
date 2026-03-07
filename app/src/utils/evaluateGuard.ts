// Variable store: maps variable name to its current value
export type VariableStore = { [variableName: string]: number | string | boolean };

// Evaluate a simple FEEL guard expression against a variable store.
// Supports: >, <, >=, <=, =, !=, and, or, not(), true, false, numbers, strings.
// Returns true if the guard passes (or if evaluation fails — fail-open so we
// don't silently block time constraints for valid guards we can't parse).
export function evaluateGuard(expr: string, store: VariableStore): boolean {
    try {
        // Replace FEEL identifiers with store values
        const js = expr
            .replace(/\bor\b/g, '||')
            .replace(/\band\b/g, '&&')
            .replace(/\bnot\(([^)]+)\)/g, '!($1)')
            .replace(/\b([A-Za-z_][A-Za-z0-9_ ]*)\b/g, (match) => {
                const trimmed = match.trim();
                if (trimmed in store) {
                    const val = store[trimmed];
                    return typeof val === 'string' ? `"${val}"` : String(val);
                }
                return match;
            })
            // FEEL uses = for equality and != for inequality
            .replace(/([^!<>])=(?!=)/g, '$1==')
            .replace(/!=/g, '!==');
        // eslint-disable-next-line no-new-func
        return !!new Function(`return (${js})`)();
    } catch {
        return true; // fail-open
    }
}
