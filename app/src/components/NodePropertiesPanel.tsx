import { Node } from 'reactflow';
import styled from 'styled-components';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VariableType = 'Int' | 'Bool' | 'String';

export interface DCRVariable {
    id: string;
    name: string;
    type: VariableType;
    defaultValue?: string;
}

export type RelationType = 'condition' | 'response' | 'milestone' | 'include' | 'exclude';

export interface PendingEdge {
    sourceId: string;
    relationType: RelationType;
}

// ─── Styled components ────────────────────────────────────────────────────────

const Panel = styled.div<{ $visible: boolean }>`
    position: fixed;
    top: 0;
    right: 0;
    width: 260px;
    height: 100vh;
    background: #ffffff;
    border-left: 1px solid #e0e0e0;
    display: flex;
    flex-direction: column;
    transform: translateX(${p => p.$visible ? '0' : '100%'});
    transition: transform 0.2s ease;
    z-index: 100;
    font-family: 'Segoe UI', system-ui, sans-serif;
    overflow: hidden;
    box-shadow: -2px 0 8px rgba(0,0,0,0.06);
`;

const PanelHeader = styled.div`
    padding: 14px 16px 12px;
    border-bottom: 1px solid #e8e8e8;
    background: #f8f8f8;
`;

const PanelTitle = styled.div`
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #999;
    margin-bottom: 3px;
`;

const NodeLabel = styled.div`
    font-size: 13px;
    font-weight: 600;
    color: #1a1a1a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const PanelBody = styled.div`
    flex: 1;
    overflow-y: auto;
    padding-bottom: 70px;

    &::-webkit-scrollbar { width: 4px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 2px; }
`;

const Section = styled.div`
    padding: 12px 16px;
    border-bottom: 1px solid #f0f0f0;
`;

const SectionTitle = styled.div`
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #bbb;
    margin-bottom: 8px;
`;

const ToggleRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    cursor: pointer;
    user-select: none;
    &:not(:last-child) { border-bottom: 1px solid #f5f5f5; }
`;

const ToggleLabel = styled.span`
    font-size: 12px;
    color: #444;
`;

const ToggleTrack = styled.div<{ $checked: boolean; $color: string }>`
    width: 34px;
    height: 18px;
    border-radius: 9px;
    background: ${p => p.$checked ? p.$color : '#e0e0e0'};
    position: relative;
    transition: background 0.2s;
    flex-shrink: 0;
    &::after {
        content: '';
        position: absolute;
        top: 2px;
        left: ${p => p.$checked ? '18px' : '2px'};
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: white;
        transition: left 0.2s;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
`;

const VarList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 8px;
`;

const VarRow = styled.div`
    display: flex;
    align-items: center;
    gap: 5px;
    background: #f8f8f8;
    border: 1px solid #e8e8e8;
    border-radius: 6px;
    padding: 5px 8px;
`;

const VarInput = styled.input`
    background: transparent;
    border: none;
    outline: none;
    color: #1a1a1a;
    font-family: inherit;
    font-size: 12px;
    flex: 1;
    min-width: 0;
    &::placeholder { color: #ccc; }
`;

const VarSelect = styled.select`
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    color: #555;
    font-family: inherit;
    font-size: 11px;
    padding: 2px 4px;
    cursor: pointer;
    outline: none;
`;

const RemoveBtn = styled.button`
    background: none;
    border: none;
    cursor: pointer;
    color: #ccc;
    font-size: 16px;
    padding: 0;
    line-height: 1;
    display: flex;
    align-items: center;
    transition: color 0.15s;
    &:hover { color: #dc3545; }
`;

const AddVarButton = styled.button`
    width: 100%;
    padding: 7px;
    background: transparent;
    border: 1px dashed #d0d0d0;
    border-radius: 6px;
    color: #aaa;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
    &:hover { border-color: #999; color: #555; }
`;

const PanelFooter = styled.div`
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 12px 16px;
    border-top: 1px solid #e8e8e8;
    background: white;
`;

const DeleteButton = styled.button`
    width: 100%;
    padding: 8px;
    border-radius: 6px;
    border: 1px solid #e0c0c0;
    background: transparent;
    color: #dc3545;
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    &:hover { background: #fff5f5; border-color: #dc3545; }
`;

const FieldLabel = styled.div`
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #bbb;
    margin-bottom: 4px;
`;

const TextInput = styled.input`
    width: 100%;
    padding: 7px 10px;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    font-family: inherit;
    font-size: 12px;
    color: #1a1a1a;
    background: #fafafa;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s;

    &:focus {
        border-color: #999;
        background: white;
    }
`;

// ─── Component ────────────────────────────────────────────────────────────────

interface NodePropertiesPanelProps {
    selectedNode: Node | null;
    allNodes?: Node[];
    onUpdateNode: (nodeId: string, data: Partial<any>) => void;
    onDeleteNode: (nodeId: string) => void;
    pendingEdge: PendingEdge | null;
    onStartEdge: (pending: PendingEdge | null) => void;
}

const NodePropertiesPanel = ({
    selectedNode,
    onUpdateNode,
    onDeleteNode,
}: NodePropertiesPanelProps) => {
    if (!selectedNode) return <Panel $visible={false} />;

    const data = selectedNode.data;

    const updateMarking = (key: 'included' | 'executed' | 'pending') => {
        onUpdateNode(selectedNode.id, { [key]: !data[key] });
    };

    // Single variable per node
    const variable: DCRVariable = (data.variables && data.variables.length > 0)
        ? data.variables[0]
        : { id: `var_${selectedNode.id}`, name: '', type: 'Int' as VariableType, defaultValue: '' };

    const updateVariable = (changes: Partial<DCRVariable>) => {
        const updated = { ...variable, ...changes };
        // Only store if name is set
        onUpdateNode(selectedNode.id, {
            variables: updated.name ? [updated] : []
        });
    };

    return (
        <Panel $visible={true}>
            <PanelHeader>
                <PanelTitle>Node Properties</PanelTitle>
            </PanelHeader>

            <PanelBody>
                <Section>
                    <SectionTitle>Label</SectionTitle>
                    <TextInput
                        value={data.label || ''}
                        onChange={e => onUpdateNode(selectedNode.id, { label: e.target.value })}
                        onMouseDown={e => e.stopPropagation()}
                        placeholder="Event label"
                    />
                </Section>

                <Section>
                    <SectionTitle>Role</SectionTitle>
                    <TextInput
                        value={data.role || ''}
                        onChange={e => onUpdateNode(selectedNode.id, { role: e.target.value })}
                        onMouseDown={e => e.stopPropagation()}
                        placeholder="Role"
                    />
                </Section>

                <Section>
                    <SectionTitle>Marking</SectionTitle>
                    {([
                        { key: 'included', label: 'Included', color: '#28a745' },
                        { key: 'executed', label: 'Executed', color: '#28a745' },
                        { key: 'pending',  label: 'Pending',  color: '#2192FF' },
                    ] as const).map(({ key, label, color }) => (
                        <ToggleRow key={key} onClick={() => updateMarking(key)}
                            onMouseDown={e => e.stopPropagation()}>
                            <ToggleLabel>{label}</ToggleLabel>
                            <ToggleTrack $checked={!!data[key]} $color={color} />
                        </ToggleRow>
                    ))}
                </Section>

                <Section>
                    <SectionTitle>Variable</SectionTitle>
                    <VarRow>
                        <VarInput
                            value={variable.name}
                            placeholder="name"
                            onChange={e => updateVariable({ name: e.target.value })}
                            onMouseDown={e => e.stopPropagation()}
                        />
                        <VarSelect
                            value={variable.type}
                            onChange={e => {
                                const newType = e.target.value as VariableType;
                                updateVariable({
                                    type: newType,
                                    defaultValue: newType === 'Bool' ? 'true' : ''
                                });
                            }}
                            onMouseDown={e => e.stopPropagation()}
                        >
                            <option value="Int">Int</option>
                            <option value="Bool">Bool</option>
                            <option value="String">String</option>
                        </VarSelect>
                        {variable.type === 'Bool' ? (
                            <VarSelect
                                value={variable.defaultValue ?? 'true'}
                                onChange={e => updateVariable({ defaultValue: e.target.value })}
                                onMouseDown={e => e.stopPropagation()}
                            >
                                <option value="true">true</option>
                                <option value="false">false</option>
                            </VarSelect>
                        ) : (
                            <VarInput
                                value={variable.defaultValue ?? ''}
                                placeholder="default"
                                type={variable.type === 'Int' ? 'number' : 'text'}
                                onMouseDown={e => e.stopPropagation()}
                                onChange={e => updateVariable({ defaultValue: e.target.value })}
                            />
                        )}
                    </VarRow>
                </Section>
            </PanelBody>

            <PanelFooter>
                <DeleteButton onClick={() => onDeleteNode(selectedNode.id)}
                    onMouseDown={e => e.stopPropagation()}>
                    Delete Node
                </DeleteButton>
            </PanelFooter>
        </Panel>
    );
};

export default NodePropertiesPanel;
export type { NodePropertiesPanelProps };
