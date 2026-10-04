export type Gender = 'male' | 'female' | 'other';

export interface Person {
  id: string;
  fullName: string;
  birthDate?: string; // e.g. "1942", "1942-05", "1942-05-12"
  isBirthApproximate?: boolean;
  deathDate?: string;
  isDeathApproximate?: boolean;
  photoUrl?: string; // base64 or URL
  gender?: Gender;
  notes?: string;
}

export type RelationshipType = 'parent-child' | 'spouse';
export type ParentChildSubType = 'biological' | 'adoptive';

export interface Relationship {
  id: string;
  type: RelationshipType;
  person1Id: string; // for parent-child: parentId; for spouse: spouse1Id
  person2Id: string; // for parent-child: childId; for spouse: spouse2Id
  subType?: ParentChildSubType;
  coparentId?: string; // connects child to a specific spouse union
  orderIndex?: number; // manual ordering of children
}

export interface FamilyTreeData {
  persons: Record<string, Person>;
  relationships: Relationship[];
  metadata: {
    title: string;
    lastUpdated: string;
  };
}

export type ViewType = 'detailed-vertical' | 'compact-vertical' | 'compact-horizontal';

export interface LayoutNode {
  id: string;
  uniqueKey?: string;
  person: Person;
  x: number;
  y: number;
  width: number;
  height: number;
  generation: number;
  isCollapsed?: boolean;
  descendantCount?: number;
  spouses?: Person[];
  isSecondaryInstance?: boolean; // For consanguineous marriages shown in secondary visual position
}

export interface LayoutConnector {
  id: string;
  type: 'marriage' | 'child' | 'cross-branch';
  path: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  label?: string;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  connectors: LayoutConnector[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

export interface DateValidationResult {
  isValid: boolean;
  warning?: string;
}
