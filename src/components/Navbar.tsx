import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  Download,
  Upload,
  Undo2,
  Redo2,
  Maximize2,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  GitBranch,
  Layers,
  LayoutGrid,
  Menu,
  X,
  CloudUpload,
  RefreshCw
} from 'lucide-react';
import { ViewType, FamilyTreeData, Person } from '../types/family';
import { SaveStatus } from '../utils/storage';

interface NavbarProps {
  treeData: FamilyTreeData;
  viewType: ViewType;
  onViewChange: (view: ViewType) => void;
  onAddPerson: () => void;
  onOpenImport: () => void;
  onOpenExport: () => void;
  onOpenTests: () => void;
  onSelectPerson: (personId: string) => void;
  onFitToScreen: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: SaveStatus;
  isReadOnly: boolean;
  onToggleReadOnly: () => void;
  onSyncToServer?: () => void;
  onRefreshFromServer?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  treeData,
  viewType,
  onViewChange,
  onAddPerson,
  onOpenImport,
  onOpenExport,
  onOpenTests,
  onSelectPerson,
  onFitToScreen,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  saveStatus,
  isReadOnly,
  onToggleReadOnly,
  onSyncToServer,
  onRefreshFromServer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  // Search results
  const searchResults: Person[] = searchQuery.trim()
    ? Object.values(treeData.persons).filter(p =>
        p.fullName.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : [];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isMobileSearchOpen && mobileSearchRef.current) {
      mobileSearchRef.current.focus();
    }
  }, [isMobileSearchOpen]);

  const personCount = Object.keys(treeData.persons).length;

  return (
    <>
      <header className="h-14 sm:h-16 px-3 sm:px-6 bg-white border-b border-stone-200 flex items-center justify-between z-30 select-none shadow-xs relative">
        {/* Zone 1: Wordmark / Brand */}
        <div className="flex items-center gap-2 sm:gap-3 shrink min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-stone-900 text-amber-50 flex items-center justify-center font-hebrew-serif font-bold text-lg sm:text-xl shadow-xs shrink-0">
            י
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-hebrew-serif text-base sm:text-lg md:text-xl font-bold tracking-tight text-stone-900 leading-tight truncate">
              <span className="inline sm:hidden">משפחת יהודה</span>
              <span className="hidden sm:inline">אילן היוחסין של משפחת יהודה</span>
            </span>
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-stone-500">
              <span className="truncate">{personCount} נפשות</span>
              <span aria-hidden="true">·</span>
              {saveStatus === 'saved' && (
                <span className="text-emerald-700 flex items-center gap-1 shrink-0" title="כל הנתונים שמורים ומסונכרנים בשרת">
                  <CheckCircle2 className="w-3 h-3" />
                  <span className="hidden xs:inline">שמור בשרת</span>
                </span>
              )}
              {saveStatus === 'saving' && (
                <span className="text-amber-700 flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3 animate-spin" />
                  <span className="hidden xs:inline">שומר בשרת...</span>
                </span>
              )}
              {saveStatus === 'error' && (
                <button
                  onClick={onSyncToServer}
                  className="text-rose-700 hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
                  title="שגיאת שמירה - לחץ לניסיון חוזר"
                >
                  <AlertCircle className="w-3 h-3" />
                  <span className="hidden xs:inline">שגיאה (נסה שוב)</span>
                </button>
              )}
              {saveStatus === 'offline' && (
                <button
                  onClick={onSyncToServer}
                  className="text-amber-800 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1 shrink-0 cursor-pointer text-[10px]"
                  title="שמור מקומית בלבד - לחץ לסנכרון לשרת"
                >
                  <CloudUpload className="w-3 h-3 text-amber-600" />
                  <span>סנכרן לשרת</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Zone 2: Desktop View Switcher (Segmented Control) */}
        <div className="hidden lg:flex items-center gap-1 p-1 bg-stone-100 rounded-lg border border-stone-200">
          <button
            onClick={() => onViewChange('detailed-vertical')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              viewType === 'detailed-vertical'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
            title="תצוגה מפורטת עם תמונות ותאריכים, דורות מלמעלה למטה"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>תצוגה מפורטת</span>
          </button>

          <button
            onClick={() => onViewChange('compact-vertical')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              viewType === 'compact-vertical'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
            title="שמות בלבד, דורות מלמעלה למטה"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>מקוצרת לאורך</span>
          </button>

          <button
            onClick={() => onViewChange('compact-horizontal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              viewType === 'compact-horizontal'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
            title="שמות בלבד, דורות מימין לשמאל"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>מקוצרת לרוחב (RTL)</span>
          </button>
        </div>

        {/* Zone 3: Actions & Mobile Hamburger */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Desktop Search Input */}
          <div className="relative hidden md:block" ref={searchRef}>
            <div className="flex items-center bg-stone-100 hover:bg-stone-50 border border-stone-200 rounded-lg px-2.5 py-1.5 transition-colors focus-within:bg-white focus-within:ring-2 focus-within:ring-stone-400">
              <Search className="w-3.5 h-3.5 text-stone-400 ml-1.5 shrink-0" />
              <input
                type="text"
                placeholder="חיפוש אדם..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                className="bg-transparent text-xs text-stone-900 placeholder:text-stone-300 outline-none w-28 lg:w-36 transition-all"
              />
            </div>

            {/* Desktop Search Dropdown */}
            {isSearchOpen && searchResults.length > 0 && (
              <div className="absolute right-0 mt-1 w-64 bg-white border border-stone-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-50 py-1">
                {searchResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectPerson(p.id);
                      setIsSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full text-right px-3 py-2 text-xs hover:bg-stone-50 transition-colors flex items-center justify-between"
                  >
                    <span className="font-medium text-stone-900 truncate">{p.fullName}</span>
                    <span className="text-stone-400 font-mono text-[11px] shrink-0">
                      {p.birthDate ? `${p.birthDate}${p.deathDate ? ` - ${p.deathDate}` : ''}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Mobile Search Toggle Button */}
          <button
            onClick={() => setIsMobileSearchOpen(v => !v)}
            title="חיפוש"
            className={`p-2 rounded-lg border transition-colors md:hidden ${
              isMobileSearchOpen
                ? 'bg-stone-900 text-white border-stone-900'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100 border-stone-200'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>

          {/* Desktop Undo / Redo */}
          <div className="hidden sm:flex items-center gap-0.5 border border-stone-200 rounded-lg p-0.5 bg-stone-50">
            <button
              onClick={onUndo}
              disabled={!canUndo || isReadOnly}
              title="בטל פעולה אחרונה (Ctrl+Z)"
              className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-white rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo || isReadOnly}
              title="בצע שוב (Ctrl+Y)"
              className="p-1.5 text-stone-600 hover:text-stone-900 hover:bg-white rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Fit to screen button (always accessible) */}
          <button
            onClick={onFitToScreen}
            title="התאם עץ למסך"
            className="p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg border border-stone-200 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          {/* Desktop Import Button */}
          <button
            onClick={onOpenImport}
            title="ייבוא מקובץ (JSON / SVG)"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>ייבוא</span>
          </button>

          {/* Desktop Export & Print Button */}
          <button
            onClick={onOpenExport}
            title="ייצוא תמונה והדפסה A4"
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>ייצוא</span>
          </button>

          {/* ReadOnly Lock/Unlock Status and Action Button */}
          <button
            onClick={onToggleReadOnly}
            title={
              isReadOnly
                ? 'עץ המשפחה נעול במצב צפייה. לחץ להזנת סיסמה ופתיחה לעריכה'
                : 'מצב עריכה פעיל. לחץ לנעילה חזרה למצב צפייה'
            }
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer shadow-2xs whitespace-nowrap active:scale-95 ${
              isReadOnly
                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 hover:border-amber-400'
                : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400'
            }`}
          >
            {isReadOnly ? (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span className="hidden xs:inline">נעול לצפייה</span>
                <span className="text-[10px] text-amber-800 font-bold underline mr-0.5">פתח</span>
              </>
            ) : (
              <>
                <Unlock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span className="hidden xs:inline">פתוח לעריכה</span>
                <span className="text-[10px] text-emerald-800 font-medium mr-0.5">(נעל)</span>
              </>
            )}
          </button>

          {/* Add Person Primary Action */}
          <button
            onClick={isReadOnly ? onToggleReadOnly : onAddPerson}
            title={isReadOnly ? 'העץ במצב צפייה נעול. לחץ להזנת סיסמה להוספת אדם' : 'הוסף אדם חדש לעץ'}
            className={`flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-xs font-medium rounded-lg shadow-xs transition-colors whitespace-nowrap cursor-pointer ${
              isReadOnly
                ? 'bg-stone-100 hover:bg-stone-200 text-stone-600 border border-stone-200'
                : 'text-white bg-stone-900 hover:bg-stone-800'
            }`}
          >
            {isReadOnly ? <Lock className="w-3.5 h-3.5 text-stone-500" /> : <Plus className="w-4 h-4" />}
            <span className="hidden xs:inline">{isReadOnly ? 'הוסף אדם (נעול)' : 'הוסף אדם'}</span>
          </button>

          {/* Desktop Tests Runner */}
          <button
            onClick={onOpenTests}
            title="בדיקות קבלה אוטומטיות"
            className="hidden lg:flex p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>

          {/* Mobile Menu Hamburger Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen(v => !v)}
            title="תפריט אפשרויות"
            className="p-2 text-stone-700 hover:bg-stone-100 rounded-lg border border-stone-200 lg:hidden transition-colors"
          >
            {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Mobile Search Overlay Bar */}
      {isMobileSearchOpen && (
        <div className="md:hidden bg-white border-b border-stone-200 p-3 shadow-md z-30 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-stone-100 rounded-lg px-3 py-2 border border-stone-300">
              <Search className="w-4 h-4 text-stone-400 ml-2 shrink-0" />
              <input
                ref={mobileSearchRef}
                type="text"
                placeholder="הקלד שם לחיפוש..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-sm text-stone-900 placeholder:text-stone-300 outline-none"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-stone-400 hover:text-stone-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setIsMobileSearchOpen(false);
                setSearchQuery('');
              }}
              className="text-xs text-stone-600 font-medium px-2 py-1"
            >
              סגור
            </button>
          </div>

          {/* Mobile Search Results */}
          {searchQuery.trim() && (
            <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
              {searchResults.length === 0 ? (
                <div className="p-3 text-xs text-stone-400 text-center">לא נמצאו תוצאות</div>
              ) : (
                searchResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectPerson(p.id);
                      setIsMobileSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full text-right p-3 hover:bg-stone-50 flex items-center justify-between text-xs"
                  >
                    <span className="font-semibold text-stone-900">{p.fullName}</span>
                    <span className="text-stone-400 font-mono text-[11px]">
                      {p.birthDate ? `${p.birthDate}${p.deathDate ? ` - ${p.deathDate}` : ''}` : ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Mobile Slide-Over Menu Drawer */}
      {isMobileMenuOpen && (
        <div
          onClick={e => {
            if (e.target === e.currentTarget) setIsMobileMenuOpen(false);
          }}
          className="lg:hidden fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-xs flex justify-start cursor-pointer"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-72 max-w-[85vw] bg-white h-full shadow-2xl flex flex-col overflow-y-auto p-4 space-y-4 animate-in slide-in-from-right duration-200 cursor-default"
          >
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="font-hebrew-serif font-bold text-base text-stone-900">
                תפריט פעולות
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1 text-stone-400 hover:text-stone-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cloud & Database Sync Controls */}
            {(onSyncToServer || onRefreshFromServer) && (
              <div className="space-y-1.5 p-2.5 bg-amber-50/60 rounded-xl border border-amber-200/80">
                <div className="text-[11px] font-bold text-amber-900 flex items-center justify-between">
                  <span>סנכרון ומסד נתונים</span>
                  <span className="text-[10px] font-normal text-amber-700">
                    {saveStatus === 'saved' ? 'שמור בשרת ✓' : saveStatus === 'saving' ? 'שומר...' : 'שמור מקומית'}
                  </span>
                </div>
                {onSyncToServer && (
                  <button
                    onClick={() => {
                      onSyncToServer();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-amber-950 bg-white hover:bg-amber-100/70 rounded-lg border border-amber-300 font-medium text-right transition-colors shadow-xs"
                  >
                    <div className="flex items-center gap-1.5">
                      <CloudUpload className="w-3.5 h-3.5 text-amber-700" />
                      <span>שמור וסנכרן נתונים לשרת</span>
                    </div>
                  </button>
                )}
                {onRefreshFromServer && (
                  <button
                    onClick={() => {
                      onRefreshFromServer();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-stone-700 bg-white hover:bg-stone-100 rounded-lg border border-stone-200 font-medium text-right transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-stone-600" />
                    <span>טען מחדש נתונים מהשרת</span>
                  </button>
                )}
              </div>
            )}

            {/* View Switcher on Mobile */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-600 block">תצוגת העץ:</label>
              <div className="grid grid-cols-1 gap-1">
                <button
                  onClick={() => {
                    onViewChange('detailed-vertical');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-right font-medium transition-colors ${
                    viewType === 'detailed-vertical'
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>תצוגה מפורטת (עם תמונות)</span>
                </button>
                <button
                  onClick={() => {
                    onViewChange('compact-vertical');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-right font-medium transition-colors ${
                    viewType === 'compact-vertical'
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  <GitBranch className="w-4 h-4" />
                  <span>מקוצרת לאורך (שמות בלבד)</span>
                </button>
                <button
                  onClick={() => {
                    onViewChange('compact-horizontal');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs rounded-lg text-right font-medium transition-colors ${
                    viewType === 'compact-horizontal'
                      ? 'bg-stone-900 text-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>מקוצרת לרוחב (RTL)</span>
                </button>
              </div>
            </div>

            {/* Actions list */}
            <div className="space-y-2 pt-2 border-t border-stone-200">
              <label className="text-xs font-semibold text-stone-600 block">פעולות:</label>

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenImport();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-800 bg-stone-50 hover:bg-stone-100 rounded-lg border border-stone-200 font-medium text-right"
              >
                <Upload className="w-4 h-4 text-stone-600" />
                <span>ייבוא מקובץ (JSON / SVG)</span>
              </button>

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenExport();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-800 bg-stone-50 hover:bg-stone-100 rounded-lg border border-stone-200 font-medium text-right"
              >
                <Download className="w-4 h-4 text-stone-600" />
                <span>ייצוא תמונה והדפסה A4</span>
              </button>

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onFitToScreen();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-800 bg-stone-50 hover:bg-stone-100 rounded-lg border border-stone-200 font-medium text-right"
              >
                <Maximize2 className="w-4 h-4 text-stone-600" />
                <span>מרכז עץ והתאם למסך</span>
              </button>

              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={onUndo}
                  disabled={!canUndo || isReadOnly}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 disabled:opacity-40 rounded-lg border border-stone-200"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>בטל</span>
                </button>
                <button
                  onClick={onRedo}
                  disabled={!canRedo || isReadOnly}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs bg-stone-100 hover:bg-stone-200 text-stone-700 disabled:opacity-40 rounded-lg border border-stone-200"
                >
                  <Redo2 className="w-3.5 h-3.5" />
                  <span>בצע שוב</span>
                </button>
              </div>

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onToggleReadOnly();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-xs rounded-lg border font-semibold text-right transition-colors ${
                  isReadOnly
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isReadOnly ? <Lock className="w-4 h-4 text-amber-700" /> : <Unlock className="w-4 h-4 text-emerald-700" />}
                  <span>{isReadOnly ? 'מצב צפייה נעול (לחץ לפתיחה)' : 'מצב עריכה פעיל (לחץ לנעילה)'}</span>
                </div>
                <span className="text-[11px] font-bold text-amber-800 underline">
                  {isReadOnly ? 'הזן סיסמה' : 'נעל'}
                </span>
              </button>

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenTests();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-stone-600 bg-stone-50 hover:bg-stone-100 rounded-lg border border-stone-200 text-right"
              >
                <Sparkles className="w-4 h-4 text-amber-600" />
                <span>בדיקות קבלה אוטומטיות</span>
              </button>
            </div>

            {/* Tree Info Footer */}
            <div className="pt-4 border-t border-stone-200 text-stone-400 text-[11px] space-y-1">
              <div>סה״כ בני משפחה רשומים: {personCount}</div>
              <div>
                סטטוס סנכרון:{' '}
                {saveStatus === 'saved' ? 'שמור בענן ובשרת' : saveStatus === 'saving' ? 'שומר...' : 'שמור מקומית'}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
