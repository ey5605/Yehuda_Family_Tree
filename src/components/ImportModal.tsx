import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileCode,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  Eye,
  ArrowRight,
  FileText,
  Users,
  Heart,
  GitFork,
  ClipboardPaste,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { FamilyTreeData, Person, Relationship } from '../types/family';
import { parseUniversalFamilyJson, ParsedTreeOutput } from '../utils/universalTreeImporter';
import { parseSvgContent, ParseResult, ExtractedPerson, ExtractedRelationship } from '../utils/svgTreeParser';

interface ImportModalProps {
  currentTree: FamilyTreeData;
  onClose: () => void;
  onApplyTree: (importedData: FamilyTreeData, mode: 'replace' | 'merge') => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  currentTree,
  onClose,
  onApplyTree,
}) => {
  // Review & Verification Screen state
  const [stage, setStage] = useState<'input' | 'review'>('input');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [pastedJsonText, setPastedJsonText] = useState('');
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [sourceFormat, setSourceFormat] = useState<string>('JSON');

  // Parsed Data state for review
  const [parsedTreeData, setParsedTreeData] = useState<FamilyTreeData | null>(null);
  const [parsedStats, setParsedStats] = useState<{
    personsCount: number;
    relationshipsCount: number;
    spouseCount: number;
    parentChildCount: number;
  }>({ personsCount: 0, relationshipsCount: 0, spouseCount: 0, parentChildCount: 0 });

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process raw text content (JSON or SVG)
  const processFileContent = (content: string, fileName: string) => {
    setErrorMessage(null);

    const isJson = fileName.toLowerCase().endsWith('.json') || content.trim().startsWith('{') || content.trim().startsWith('[');
    const isSvg = fileName.toLowerCase().endsWith('.svg') || content.trim().startsWith('<svg');

    if (isJson) {
      try {
        const result: ParsedTreeOutput = parseUniversalFamilyJson(content);
        if (result.stats.personsCount === 0) {
          setErrorMessage('לא נמצאו אנשים בקובץ ה-JSON. ודא שהקובץ כולל שמות אנשים וקשרים.');
          return;
        }
        setParsedTreeData(result.tree);
        setParsedStats(result.stats);
        setSourceFormat(`קובץ JSON (${fileName || 'נתונים שהודבקו'})`);
        setStage('review');
      } catch (err: any) {
        setErrorMessage(err.message || 'שגיאה בפענוח קובץ ה-JSON. ודא שמבנה ה-JSON תקין.');
      }
    } else if (isSvg) {
      try {
        const svgParsed = parseSvgContent(content);
        if (svgParsed.persons.length === 0) {
          setErrorMessage('לא זוהו תיבות שמות בקובץ ה-SVG.');
          return;
        }

        // Convert svgParsed to FamilyTreeData
        const persons: Record<string, Person> = {};
        const tempIdMap: Record<string, string> = {};

        for (const ep of svgParsed.persons) {
          const realId = `person-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          tempIdMap[ep.tempId] = realId;
          persons[realId] = {
            id: realId,
            fullName: ep.fullName,
            birthDate: ep.birthDate,
            deathDate: ep.deathDate,
          };
        }

        const relationships: Relationship[] = [];
        for (const er of svgParsed.relationships) {
          const p1 = tempIdMap[er.fromTempId];
          const p2 = tempIdMap[er.toTempId];
          if (p1 && p2) {
            relationships.push({
              id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              type: er.type,
              person1Id: p1,
              person2Id: p2,
              subType: 'biological',
            });
          }
        }

        const tree: FamilyTreeData = {
          persons,
          relationships,
          metadata: {
            title: 'אילן היוחסין המיובא מ-SVG',
            lastUpdated: new Date().toISOString(),
          },
        };

        const spouseCount = relationships.filter(r => r.type === 'spouse').length;
        const parentChildCount = relationships.filter(r => r.type === 'parent-child').length;

        setParsedTreeData(tree);
        setParsedStats({
          personsCount: Object.keys(persons).length,
          relationshipsCount: relationships.length,
          spouseCount,
          parentChildCount,
        });
        setSourceFormat(`קובץ SVG (${fileName})`);
        setStage('review');
      } catch (err: any) {
        setErrorMessage('שגיאה בפענוח קובץ ה-SVG: ' + err.message);
      }
    } else {
      setErrorMessage('פורמט קובץ אינו נתמך. יש להעלות קובץ JSON (.json) או קובץ וקטורי SVG (.svg).');
    }
  };

  // Handle direct file upload
  const handleFileUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      if (content) {
        processFileContent(content, file.name);
      }
    };
    reader.onerror = () => {
      setErrorMessage('שגיאה בקריאת הקובץ מהמכשיר.');
    };
    reader.readAsText(file);
  };

  // Drag and Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  // Direct Paste Handler
  const handleApplyPastedJson = () => {
    if (!pastedJsonText.trim()) return;
    processFileContent(pastedJsonText, 'תוכן JSON שהודבק');
  };

  // Review stage inline editing
  const handleUpdatePersonName = (personId: string, newName: string) => {
    if (!parsedTreeData) return;
    const updated = {
      ...parsedTreeData,
      persons: {
        ...parsedTreeData.persons,
        [personId]: {
          ...parsedTreeData.persons[personId],
          fullName: newName,
        },
      },
    };
    setParsedTreeData(updated);
  };

  const handleRemoveRelationship = (relId: string) => {
    if (!parsedTreeData) return;
    const updatedRels = parsedTreeData.relationships.filter(r => r.id !== relId);
    setParsedTreeData({
      ...parsedTreeData,
      relationships: updatedRels,
    });
    setParsedStats({
      ...parsedStats,
      relationshipsCount: updatedRels.length,
      spouseCount: updatedRels.filter(r => r.type === 'spouse').length,
      parentChildCount: updatedRels.filter(r => r.type === 'parent-child').length,
    });
  };

  // Apply parsed tree to active tree
  const handleApply = (mode: 'replace' | 'merge') => {
    if (!parsedTreeData) return;
    onApplyTree(parsedTreeData, mode);
    onClose();
  };

  const existingTreePersonsCount = Object.keys(currentTree.persons).length;

  return (
    <div
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 cursor-pointer"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] sm:max-h-[90vh] shadow-2xl border border-stone-200 flex flex-col overflow-hidden animate-in fade-in duration-150 cursor-default"
      >
        {/* Header */}
        <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="font-hebrew-serif font-bold text-lg text-stone-900">
              {stage === 'input'
                ? 'ייבוא עץ משפחה מקובץ'
                : `תצוגת בדיקה ואישור לפני הכנסה לעץ (${sourceFormat})`}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {stage === 'input'
                ? 'טעינת קובץ נתונים JSON (תומך ריבוי בני זוג, צאצאים והורים) או קובץ SVG'
                : 'בדוק ואשר את האנשים והקשרים שזוהו לפני החלתם על האילן הפעיל'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {stage === 'input' && (
            <>
              {/* Error Message */}
              {errorMessage && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1 text-xs text-red-900 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-red-950">שגיאה בטעינת הקובץ</div>
                    <p className="mt-0.5 leading-relaxed text-red-800">{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Drag and Drop Zone */}
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDraggingOver(true);
                }}
                onDragLeave={() => setIsDraggingOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  isDraggingOver
                    ? 'border-amber-600 bg-amber-50 scale-[1.01]'
                    : 'border-stone-300 hover:border-stone-500 bg-stone-50/70 hover:bg-stone-100/70'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.svg"
                  onChange={e => handleFileUpload(e.target.files?.[0])}
                  className="hidden"
                />

                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-amber-100/80 text-amber-900 border border-amber-200 flex items-center justify-center">
                  <Upload className="w-7 h-7 text-amber-800" />
                </div>

                <div className="text-sm font-bold text-stone-900 mb-1">
                  גרור לכאן קובץ JSON או לחץ לבחירה מהמכשיר
                </div>
                <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
                  תומך בקבצי JSON מכל סוג (מערך אנשים, עץ היררכי, או גיבוי מלא) וכן בקבצי SVG וקטוריים.
                </p>

                <div className="mt-4 flex items-center justify-center gap-2">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-white border border-stone-200 text-stone-700">
                    .JSON
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-mono font-medium bg-white border border-stone-200 text-stone-700">
                    .SVG
                  </span>
                </div>
              </div>

              {/* Supported Format Helper Box */}
              <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl space-y-2.5 text-xs text-stone-700">
                <div className="flex items-center gap-2 font-semibold text-stone-900">
                  <FileCode className="w-4 h-4 text-amber-700" />
                  <span>איזה מבנה נתונים נתמך בקובץ JSON?</span>
                </div>
                <p className="text-stone-600 leading-relaxed text-[11px]">
                  המערכת יודעת לפענח אוטומטית שמות אנשים, תאריכי לידה/פטירה, וקשרים משפחתיים:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                  <div className="p-2 bg-white rounded-lg border border-stone-200">
                    <span className="font-bold text-stone-800">בני/בנות זוג:</span>
                    <div className="text-stone-500 text-[10px] mt-0.5">spouses / בני זוג (תומך בריבוי בני זוג)</div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-stone-200">
                    <span className="font-bold text-stone-800">ילדים וצאצאים:</span>
                    <div className="text-stone-500 text-[10px] mt-0.5">children / צאצאים / ילדים</div>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-stone-200">
                    <span className="font-bold text-stone-800">הורים:</span>
                    <div className="text-stone-500 text-[10px] mt-0.5">parents / הורים / father / mother</div>
                  </div>
                </div>
              </div>

              {/* Optional: Paste JSON directly */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowPasteArea(!showPasteArea)}
                  className="w-full flex items-center justify-between text-xs text-stone-600 hover:text-stone-900 font-medium py-1 px-1 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <ClipboardPaste className="w-3.5 h-3.5 text-amber-700" />
                    <span>או הדבק תוכן JSON ישירות בטקסט</span>
                  </span>
                  {showPasteArea ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showPasteArea && (
                  <div className="mt-2 space-y-2 animate-in fade-in duration-150">
                    <textarea
                      rows={6}
                      value={pastedJsonText}
                      onChange={e => setPastedJsonText(e.target.value)}
                      placeholder='[&#10;  {&#10;    "fullName": "ערן יהודה",&#10;    "spouses": ["חמוטל שפרוני", "אליזבת (ליסה)"],&#10;    "parents": ["עוזיאל יהודה", "נעמי יהודה"],&#10;    "children": ["אייל יהודה", "עמית יהודה"]&#10;  }&#10;]'
                      className="w-full p-3 text-xs bg-stone-900 text-stone-100 font-mono rounded-xl border border-stone-700 focus:ring-2 focus:ring-amber-500 focus:outline-none placeholder:text-stone-500"
                      dir="ltr"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleApplyPastedJson}
                        disabled={!pastedJsonText.trim()}
                        className="px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>פענח טקסט JSON</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Review & Verification Stage */}
          {stage === 'review' && parsedTreeData && (
            <div className="space-y-6">
              {/* Summary Stats Box */}
              <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-amber-950">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-200/80 flex items-center justify-center text-amber-900 font-bold shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm">
                      זוהו {parsedStats.personsCount} אנשים ו-{parsedStats.relationshipsCount} קשרים
                    </div>
                    <div className="text-[11px] text-amber-800 flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3 text-rose-600" />
                        {parsedStats.spouseCount} קשרי נישואין
                      </span>
                      <span className="flex items-center gap-1">
                        <GitFork className="w-3 h-3 text-amber-700" />
                        {parsedStats.parentChildCount} קשרי הורים-ילדים
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setStage('input')}
                  className="px-3 py-1.5 bg-white hover:bg-amber-100/50 border border-amber-300 rounded-lg text-amber-900 text-xs transition-colors"
                >
                  בחר קובץ אחר
                </button>
              </div>

              {/* People List Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-stone-800 px-1">
                  <span>אנשים שזוהו בקובץ:</span>
                  <span className="font-normal text-stone-500 text-[11px]">
                    ניתן לתקן שמות ישירות בתיבות
                  </span>
                </div>

                <div className="border border-stone-200 rounded-xl divide-y divide-stone-100 max-h-[300px] overflow-y-auto bg-white shadow-xs">
                  {Object.values(parsedTreeData.persons).map((person, idx) => {
                    // Find all spouses
                    const spouses = parsedTreeData.relationships
                      .filter(r => r.type === 'spouse' && (r.person1Id === person.id || r.person2Id === person.id))
                      .map(r => {
                        const spId = r.person1Id === person.id ? r.person2Id : r.person1Id;
                        return parsedTreeData.persons[spId]?.fullName || spId;
                      });

                    // Find all children
                    const children = parsedTreeData.relationships
                      .filter(r => r.type === 'parent-child' && r.person1Id === person.id)
                      .map(r => parsedTreeData.persons[r.person2Id]?.fullName || r.person2Id);

                    // Find all parents
                    const parents = parsedTreeData.relationships
                      .filter(r => r.type === 'parent-child' && r.person2Id === person.id)
                      .map(r => parsedTreeData.persons[r.person1Id]?.fullName || r.person1Id);

                    return (
                      <div key={person.id} className="p-3 hover:bg-stone-50 transition-colors flex flex-col gap-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-stone-100 text-stone-500 font-mono text-[10px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <input
                            type="text"
                            value={person.fullName}
                            onChange={e => handleUpdatePersonName(person.id, e.target.value)}
                            className="font-hebrew-serif font-bold text-stone-900 border-b border-transparent hover:border-stone-300 focus:border-amber-600 focus:outline-none px-1 py-0.5 rounded text-sm flex-1 bg-transparent"
                          />
                          {(person.birthDate || person.deathDate) && (
                            <span className="font-mono text-[11px] text-stone-400">
                              {person.birthDate || ''} {person.birthDate && person.deathDate ? '–' : ''} {person.deathDate || ''}
                            </span>
                          )}
                        </div>

                        {/* Relationships details pill badges */}
                        <div className="flex flex-wrap items-center gap-1.5 pr-7 text-[11px]">
                          {spouses.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-800">
                              <Heart className="w-2.5 h-2.5 text-rose-600" />
                              <span>{spouses.length > 1 ? `בני זוג (${spouses.length}):` : 'בן/בת זוג:'} {spouses.join(', ')}</span>
                            </span>
                          )}

                          {parents.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 border border-sky-200 text-sky-800">
                              <span>הורים: {parents.join(' ו-')}</span>
                            </span>
                          )}

                          {children.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800">
                              <span>ילדים ({children.length}): {children.slice(0, 3).join(', ')}{children.length > 3 ? '...' : ''}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-stone-600 hover:bg-stone-200 rounded-lg transition-colors"
          >
            ביטול
          </button>

          {stage === 'review' && parsedTreeData && (
            <div className="flex items-center gap-2">
              {existingTreePersonsCount > 0 && (
                <button
                  onClick={() => handleApply('merge')}
                  className="px-3.5 py-2 text-xs font-medium text-stone-800 bg-white border border-stone-300 hover:bg-stone-100 rounded-lg transition-colors flex items-center gap-1.5"
                  title="שמור על אנשי העץ הנוכחי והוסף אליהם את האנשים החדשים"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>מזג עם העץ הקיים</span>
                </button>
              )}

              <button
                onClick={() => handleApply('replace')}
                className="px-4 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                title="החלף לחלוטין את העץ הנוכחי בעץ שמיובא מהקובץ"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>החלף את העץ הקיים בחדש</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
