import { FamilyTreeData } from '../types/family';

export const SAMPLE_FAMILY_TREE: FamilyTreeData = {
  persons: {
    'p-1': {
      id: 'p-1',
      fullName: 'יהודה יהודה',
      birthDate: '1895',
      deathDate: '1972',
      notes: 'אבי השושלת, עלה לארץ ישראל בעלייה השלישית',
    },
    'p-2': {
      id: 'p-2',
      fullName: 'רחל יהודה (לבית מזרחי)',
      birthDate: '1900',
      deathDate: '1980',
    },
    'p-3': {
      id: 'p-3',
      fullName: 'יעקב יהודה',
      birthDate: '1925',
      deathDate: '2001',
    },
    'p-4': {
      id: 'p-4',
      fullName: 'שרה יהודה',
      birthDate: '1928',
      deathDate: '2015',
    },
    'p-5': {
      id: 'p-5',
      fullName: 'אברהם יהודה',
      birthDate: '1932',
    },
    'p-6': {
      id: 'p-6',
      fullName: 'לאה יהודה (לבית לוי)',
      birthDate: '1930',
      deathDate: '2018',
    },
    'p-7': {
      id: 'p-7',
      fullName: 'יוסי יהודה',
      birthDate: '1955',
    },
    'p-8': {
      id: 'p-8',
      fullName: 'דלית יהודה',
      birthDate: '1958',
    },
    'p-9': {
      id: 'p-9',
      fullName: 'מיכל יהודה',
      birthDate: '1962',
    },
    'p-10': {
      id: 'p-10',
      fullName: 'איתי יהודה',
      birthDate: '1985',
    },
    'p-11': {
      id: 'p-11',
      fullName: 'רוני יהודה',
      birthDate: '1988',
    },
    'p-12': {
      id: 'p-12',
      fullName: 'נועם יהודה',
      birthDate: '2016',
      isBirthApproximate: false,
    },
  },
  relationships: [
    // Generation 1 marriage
    { id: 'r-1', type: 'spouse', person1Id: 'p-1', person2Id: 'p-2' },
    // Generation 2 children of Gen 1
    { id: 'r-2', type: 'parent-child', person1Id: 'p-1', person2Id: 'p-3', coparentId: 'p-2' },
    { id: 'r-3', type: 'parent-child', person1Id: 'p-1', person2Id: 'p-4', coparentId: 'p-2' },
    { id: 'r-4', type: 'parent-child', person1Id: 'p-1', person2Id: 'p-5', coparentId: 'p-2' },
    // Generation 2 marriage: Yaakov + Leah
    { id: 'r-5', type: 'spouse', person1Id: 'p-3', person2Id: 'p-6' },
    // Generation 3 children of Yaakov & Leah
    { id: 'r-6', type: 'parent-child', person1Id: 'p-3', person2Id: 'p-7', coparentId: 'p-6' },
    { id: 'r-7', type: 'parent-child', person1Id: 'p-3', person2Id: 'p-8', coparentId: 'p-6' },
    { id: 'r-8', type: 'parent-child', person1Id: 'p-3', person2Id: 'p-9', coparentId: 'p-6' },
    // Generation 4 children of Yossi
    { id: 'r-9', type: 'parent-child', person1Id: 'p-7', person2Id: 'p-10' },
    { id: 'r-10', type: 'parent-child', person1Id: 'p-7', person2Id: 'p-11' },
    // Generation 5 child of Itai
    { id: 'r-11', type: 'parent-child', person1Id: 'p-10', person2Id: 'p-12' },
  ],
  metadata: {
    title: 'אילן היוחסין של משפחת יהודה - דוגמה',
    lastUpdated: new Date().toISOString(),
  },
};
