import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Link2,
  FileCode,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  Eye,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
  FileText
} from 'lucide-react';
import { FamilyTreeData, Person, Relationship } from '../types/family';
import { parseSvgContent, ParseResult, ExtractedPerson, ExtractedRelationship } from '../utils/svgTreeParser';
import { parseTreeBackup } from '../utils/storage';

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
  // Google Drawings URL State
  const defaultUrl = 'https://docs.google.com/drawings/d/1jqXfD1ClW7yEBBNbpFYZ6fvjiwlOd2H8brr6XXVv43g/edit?usp=sharing';
  const [drawingUrl, setDrawingUrl] = useState(defaultUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [copiedFailedUrl, setCopiedFailedUrl] = useState(false);
  const [authTip, setAuthTip] = useState<string | null>(null);

  // Review & Verification Screen state
  const [stage, setStage] = useState<'input' | 'review'>('input');
  const [parsedData, setParsedData] = useState<ParseResult | null>(null);
  const [sourceFormat, setSourceFormat] = useState<string>('svg');

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Attempt Google Drawings URL import
  const handleTryImportUrl = async () => {
    if (!drawingUrl.trim()) return;

    setIsLoading(true);
    setErrorMessage(null);
    setFailedUrl(null);
    setAuthTip(null);

    try {
      const response = await fetch(`/api/import-drawing?url=${encodeURIComponent(drawingUrl.trim())}`);
      const data = await response.json();

      if (!response.ok || data.error) {
        setFailedUrl(drawingUrl.trim());

        if (data.error === 'AUTH_REQUIRED') {
          setErrorMessage('המסמך ב-Google Drawings דורש התחברות לחשבון Google או הרשאת גישה ציבורית.');
          setAuthTip(
            data.tip ||
            'כדי לייבא ישירות מקישור, יש להגדיר ב-Google Drawings: שיתוף (Share) > כל מי שקיבל את הקישור יכול לצפות (Anyone with the link can view). לחלופין, ניתן להוריד מ-Google Drawings קובץ SVG או PNG ולהעלות כאן ישירות.'
          );
        } else {
          setErrorMessage(data.message || 'הייבוא מהקישור נכשל.');
        }
        setIsLoading(false);
        return;
      }

      // Received SVG content from public Google Drawing
      if (data.svg) {
        const result = parseSvgContent(data.svg);
        setParsedData(result);
        setSourceFormat('Google Drawings (SVG)');
        setStage('review');
      } else {
        setErrorMessage('התקבל קובץ אך ללא תוכן וקטורי שניתן לפענוח.');
      }
    } catch (err: any) {
      setFailedUrl(drawingUrl.trim());
      setErrorMessage(err.message || 'שגיאת רשת בעת ניסיון גישה ל-Google Drawings');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle direct file upload (SVG, PNG, JSON backup)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    if (fileName.endsWith('.json')) {
      // JSON Tree Backup
      reader.onload = event => {
        try {
          const jsonStr = event.target?.result as string;
          const backupTree = parseTreeBackup(jsonStr);

          // Convert to parsed verification format
          const extractedPersons: ExtractedPerson[] = Object.values(backupTree.persons).map((p, idx) => ({
            tempId: p.id,
            fullName: p.fullName,
            birthDate: p.birthDate,
            deathDate: p.deathDate,
            confidence: 'high',
            x: 0,
            y: 0,
            rawText: p.fullName,
          }));

          const extractedRels: ExtractedRelationship[] = backupTree.relationships.map((r, idx) => ({
            tempId: r.id,
            type: r.type,
            fromTempId: r.person1Id,
            toTempId: r.person2Id,
            fromName: backupTree.persons[r.person1Id]?.fullName || r.person1Id,
            toName: backupTree.persons[r.person2Id]?.fullName || r.person2Id,
            confidence: 'high',
            reason: 'קובץ גיבוי מובנה',
          }));

          setParsedData({
            persons: extractedPersons,
            relationships: extractedRels,
            unmatchedTexts: [],
            totalElementsFound: extractedPersons.length,
          });
          setSourceFormat('קובץ גיבוי JSON');
          setStage('review');
        } catch (err: any) {
          setErrorMessage(err.message || 'קובץ הגיבוי אינו תקין');
        }
      };
      reader.readAsText(file);
    } else if (fileName.endsWith('.svg') || file.type.includes('svg')) {
      // SVG File
      reader.onload = event => {
        try {
          const svgContent = event.target?.result as string;
          const result = parseSvgContent(svgContent);
          setParsedData(result);
          setSourceFormat(`קובץ SVG (${file.name})`);
          setStage('review');
        } catch (err: any) {
          setErrorMessage('שגיאה בפענוח קובץ ה-SVG: ' + err.message);
        }
      };
      reader.readAsText(file);
    } else {
      setErrorMessage(
        'קובץ תמונה רסטר (.png/.jpg) דורש חילוץ טקסט ויזואלי. מומלץ לייצא מ-Google Drawings כקובץ SVG (קובץ > הורדה > גרפיקה וקטורית מדרגית .svg) לקבלת חילוץ מלא ומדויק ללא שגיאות.'
      );
    }
  };

  // Inline editing in Review stage
  const handleUpdatePersonName = (tempId: string, newName: string) => {
    if (!parsedData) return;
    setParsedData({
      ...parsedData,
      persons: parsedData.persons.map(p =>
        p.tempId === tempId ? { ...p, fullName: newName } : p
      ),
    });
  };

  const handleUpdatePersonDate = (tempId: string, field: 'birth' | 'death', val: string) => {
    if (!parsedData) return;
    setParsedData({
      ...parsedData,
      persons: parsedData.persons.map(p =>
        p.tempId === tempId
          ? {
              ...p,
              birthDate: field === 'birth' ? val : p.birthDate,
              deathDate: field === 'death' ? val : p.deathDate,
            }
          : p
      ),
    });
  };

  const handleRemoveRelationship = (tempId: string) => {
    if (!parsedData) return;
    setParsedData({
      ...parsedData,
      relationships: parsedData.relationships.filter(r => r.tempId !== tempId),
    });
  };

  // Apply parsed tree to active tree
  const handleApply = (mode: 'replace' | 'merge') => {
    if (!parsedData) return;

    const newPersons: Record<string, Person> = {};
    const tempIdMap: Record<string, string> = {};

    // 1. Build Person objects
    for (const ep of parsedData.persons) {
      const realId = `person-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      tempIdMap[ep.tempId] = realId;
      newPersons[realId] = {
        id: realId,
        fullName: ep.fullName,
        birthDate: ep.birthDate,
        deathDate: ep.deathDate,
      };
    }

    // 2. Build Relationships
    const newRelationships: Relationship[] = [];
    for (const er of parsedData.relationships) {
      const p1 = tempIdMap[er.fromTempId];
      const p2 = tempIdMap[er.toTempId];
      if (p1 && p2) {
        newRelationships.push({
          id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: er.type,
          person1Id: p1,
          person2Id: p2,
          subType: 'biological',
        });
      }
    }

    const importedTree: FamilyTreeData = {
      persons: newPersons,
      relationships: newRelationships,
      metadata: {
        title: 'אילן היוחסין של משפחת יהודה',
        lastUpdated: new Date().toISOString(),
      },
    };

    onApplyTree(importedTree, mode);
    onClose();
  };

  const copyFailedUrlToClipboard = () => {
    if (!failedUrl) return;
    navigator.clipboard.writeText(failedUrl);
    setCopiedFailedUrl(true);
    setTimeout(() => setCopiedFailedUrl(false), 2000);
  };

  const existingTreePersonsCount = Object.keys(currentTree.persons).length;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] shadow-2xl border border-stone-200 flex flex-col overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="p-5 border-b border-stone-200 flex items-center justify-between bg-stone-50">
          <div>
            <h2 className="font-hebrew-serif font-bold text-lg text-stone-900">
              {stage === 'input'
                ? 'ייבוא עץ משפחה מ-Google Drawings או מקובץ'
                : `תצוגת בדיקה ואישור לפני הכנסה לעץ (${sourceFormat})`}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {stage === 'input'
                ? 'שחזור מבנה המשפחה, שמות, תאריכים וקשרים ממסמך גרפי'
                : 'בדוק ואשר את האנשים והקשרים שזוהו לפני החלתם על העץ הפעיל'}
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
              {/* Option 1: Google Drawings URL */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-stone-800">
                  קישור למסמך Google Drawings:
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="url"
                      value={drawingUrl}
                      onChange={e => setDrawingUrl(e.target.value)}
                      placeholder="https://docs.google.com/drawings/d/.../edit"
                      className="w-full pl-3 pr-9 py-2 text-xs bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-400 focus:outline-none font-mono"
                    />
                    <Link2 className="w-4 h-4 text-stone-400 absolute right-3 top-2.5" />
                  </div>
                  <button
                    onClick={handleTryImportUrl}
                    disabled={isLoading || !drawingUrl.trim()}
                    className="px-4 py-2 bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>טוען מסמך...</span>
                      </>
                    ) : (
                      <>
                        <ArrowRight className="w-3.5 h-3.5 rotate-180" />
                        <span>נסה לייבא</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Error & Authentication Explanation Box */}
              {errorMessage && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 text-xs text-amber-900">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-amber-950">{errorMessage}</div>
                      {authTip && <p className="mt-1 leading-relaxed text-amber-800">{authTip}</p>}
                    </div>
                  </div>

                  {failedUrl && (
                    <div className="pt-2 border-t border-amber-200 flex items-center justify-between bg-amber-100/60 p-2 rounded-lg font-mono text-[11px] overflow-hidden">
                      <span className="truncate flex-1 text-stone-700">{failedUrl}</span>
                      <button
                        onClick={copyFailedUrlToClipboard}
                        className="ml-2 px-2 py-1 bg-white hover:bg-amber-50 border border-amber-300 rounded text-amber-900 flex items-center gap-1 shrink-0"
                      >
                        {copiedFailedUrl ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedFailedUrl ? 'הועתק!' : 'העתק קישור'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Option 2: Upload Exported File */}
              <div className="pt-2">
                <div className="text-xs font-semibold text-stone-800 mb-2">
                  חלופה ישירה: העלאת קובץ (SVG מ-Google Drawings או קובץ גיבוי)
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".svg,.json"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-stone-300 hover:border-stone-500 rounded-xl p-6 text-center cursor-pointer bg-stone-50 hover:bg-stone-100 transition-colors"
                >
                  <Upload className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                  <div className="text-xs font-medium text-stone-800">
                    לחץ כאן לבחירת קובץ SVG או JSON
                  </div>
                  <div className="text-[11px] text-stone-500 mt-1">
                    ב-Google Drawings: לחץ על <strong>קובץ &gt; הורדה &gt; גרפיקה וקטורית מדרגית (.svg)</strong>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Review & Verification Stage */}
          {stage === 'review' && parsedData && (
            <div className="space-y-6">
              <div className="p-3 bg-stone-100 border border-stone-200 rounded-lg flex items-center justify-between text-xs text-stone-700">
                <span>
                  זוהו <strong>{parsedData.persons.length}</strong> אנשים ו-
                  <strong>{parsedData.relationships.length}</strong> קשרי משפחה.
                </span>
                <button
                  onClick={() => setStage('input')}
                  className="text-stone-500 hover:text-stone-900 underline"
                >
                  חזור לבחירת מקור
                </button>
              </div>

              {/* Extracted Persons Verification List */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-stone-900">
                  אנשים שזוהו (באפשרותך לתקן שמות ותאריכים לפני אישור):
                </div>

                <div className="max-h-60 overflow-y-auto border border-stone-200 rounded-lg divide-y divide-stone-100">
                  {parsedData.persons.map(p => (
                    <div
                      key={p.tempId}
                      className="p-3 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex-1 w-full sm:w-auto">
                        <input
                          type="text"
                          value={p.fullName}
                          onChange={e => handleUpdatePersonName(p.tempId, e.target.value)}
                          className="font-medium text-stone-900 w-full px-2 py-1 bg-stone-50 hover:bg-white border border-stone-200 rounded focus:ring-1 focus:ring-stone-400"
                        />
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="text"
                          value={p.birthDate || ''}
                          onChange={e => handleUpdatePersonDate(p.tempId, 'birth', e.target.value)}
                          placeholder="שנת לידה"
                          className="w-24 px-2 py-1 font-mono text-[11px] bg-stone-50 border border-stone-200 rounded"
                        />
                        <input
                          type="text"
                          value={p.deathDate || ''}
                          onChange={e => handleUpdatePersonDate(p.tempId, 'death', e.target.value)}
                          placeholder="שנת פטירה"
                          className="w-24 px-2 py-1 font-mono text-[11px] bg-stone-50 border border-stone-200 rounded"
                        />

                        {/* Confidence Indicator */}
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                            p.confidence === 'high'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {p.confidence === 'high' ? 'זוהה בביטחון' : 'דורש בדיקה'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Extracted Relationships Verification List */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-stone-900">
                  קשרי משפחה שזוהו:
                </div>

                <div className="max-h-52 overflow-y-auto border border-stone-200 rounded-lg divide-y divide-stone-100">
                  {parsedData.relationships.length === 0 ? (
                    <div className="p-4 text-xs text-stone-400 text-center">
                      לא זוהו קשרים גרפיים מובהקים. ניתן יהיה לחבר בין האנשים ישירות בעץ.
                    </div>
                  ) : (
                    parsedData.relationships.map(rel => (
                      <div
                        key={rel.tempId}
                        className="p-2.5 bg-white flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-stone-900">{rel.fromName}</span>
                          <span className="text-stone-400 font-mono">
                            {rel.type === 'parent-child' ? '← הורה של ←' : '↔ בן/בת זוג של ↔'}
                          </span>
                          <span className="font-semibold text-stone-900">{rel.toName}</span>
                          <span className="text-[10px] text-stone-400">({rel.reason})</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                              rel.confidence === 'high'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {rel.confidence === 'high' ? 'ודאי' : 'משוער'}
                          </span>

                          <button
                            onClick={() => handleRemoveRelationship(rel.tempId)}
                            title="הסר קשר שגוי"
                            className="p-1 text-stone-400 hover:text-rose-600 rounded"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
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

          {stage === 'review' && (
            <div className="flex items-center gap-2">
              {existingTreePersonsCount > 0 && (
                <button
                  onClick={() => handleApply('merge')}
                  className="px-4 py-2 text-xs font-medium text-stone-800 bg-white border border-stone-300 hover:bg-stone-100 rounded-lg transition-colors"
                >
                  מזג עם העץ הקיים ({existingTreePersonsCount} אנשים)
                </button>
              )}

              <button
                onClick={() => handleApply('replace')}
                className="px-4 py-2 text-xs font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition-colors shadow-xs"
              >
                {existingTreePersonsCount > 0 ? 'החלף את העץ הקיים' : 'החל על העץ'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
