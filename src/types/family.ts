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

export interface BranchCollapseButton {
  id: string;
  personId: string;
  collapseKey?: string;
  spouseId?: string | null;
  x: number;
  y: number;
  descendantCount: number;
  isCollapsed: boolean;
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
  branchButtons?: BranchCollapseButton[];
}

export interface DateValidationResult {
  isValid: boolean;
  warning?: string;
}

export type BgThemeId = 'default' | 'dark-gray' | 'darker-gray' | 'black';

export interface BgThemeOption {
  id: BgThemeId;
  name: string;
  shortLabel: string;
  canvasBg: string;
  appBg: string;
  dotColor: string;
  dotOpacity: number;
  connectorStroke: string;
  isDark: boolean;
}

export const BG_THEMES: Record<BgThemeId, BgThemeOption> = {
  'default': {
    id: 'default',
    name: 'ברירת מחדל (מקורי)',
    shortLabel: 'בהיר',
    canvasBg: '#f5f5f4',
    appBg: '#fafaf9',
    dotColor: '#a8a29e',
    dotOpacity: 0.35,
    connectorStroke: '#78716c',
    isDark: false,
  },
  'dark-gray': {
    id: 'dark-gray',
    name: 'אפור בהיר (#cbd5e1)',
    shortLabel: 'אפור בהיר',
    canvasBg: '#cbd5e1',
    appBg: '#cbd5e1',
    dotColor: '#64748b',
    dotOpacity: 0.3,
    connectorStroke: '#475569',
    isDark: false,
  },
  'darker-gray': {
    id: 'darker-gray',
    name: 'אפור כהה (#71717a)',
    shortLabel: 'אפור כהה',
    canvasBg: '#71717a',
    appBg: '#71717a',
    dotColor: '#e4e4e7',
    dotOpacity: 0.32,
    connectorStroke: '#f4f4f5',
    isDark: true,
  },
  'black': {
    id: 'black',
    name: 'שחור',
    shortLabel: 'שחור',
    canvasBg: '#000000',
    appBg: '#000000',
    dotColor: '#3f3f46',
    dotOpacity: 0.32,
    connectorStroke: '#e2e8f0',
    isDark: true,
  },
};
