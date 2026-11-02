export type Confidence = 'confirmed' | 'inferred';
export interface Evidence { file: string; line: number; excerpt?: string }
export interface Sourced { confidence: Confidence; evidence: Evidence[] }
export interface Claim extends Sourced { text: string }
export interface Domain { id: string; name: string; description: string }
export interface Table extends Sourced { id: string; name: string; tableName: string }
export interface BusinessObject extends Sourced {
  id: string; name: string; domainId: string; summary: Claim;
  tableRefs: { tableId: string; role: 'primary' | 'supporting' }[];
  prerequisites: Claim[]; importance?: 'core' | 'normal';
}
export interface Relation extends Sourced {
  id: string; source: string; target: string; type: 'owns' | 'belongs-to' | 'uses' | 'associates';
  label: string; cardinality: '1-1' | '1-n' | 'n-n'; note?: string;
}
export interface Step extends Sourced {
  id: string; description: string; objectIds: string[]; reads: string[]; writes: string[];
}
export interface Flow extends Sourced { id: string; name: string; description: string; objectIds: string[]; steps: Step[] }
export interface AtlasMap {
  schemaVersion: '0'; project: { name: string; description: string; generatedAt: string; sourceRevision?: string };
  domains: Domain[]; objects: BusinessObject[]; relations: Relation[]; tables: Table[]; flows: Flow[];
  layout?: { positions: Record<string, { x: number; y: number }> };
}
