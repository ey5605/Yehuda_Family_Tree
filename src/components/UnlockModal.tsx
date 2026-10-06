import React, { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, X, Eye, EyeOff, AlertCircle, KeyRound } from 'lucide-react';

interface UnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: () => void;
}

const EDIT_PASSWORD = '0529458562';

export const UnlockModal: React.FC<UnlockModalProps> = ({
  isOpen,
  onClose,
  onUnlock,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(null);
      setShowPassword(false);
      // Auto focus after mount
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim() === EDIT_PASSWORD) {
      setError(null);
      onUnlock();
      onClose();
    } else {
      setError('סיסמה שגויה, אנא נסה שוב.');
      inputRef.current?.select();
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-100 bg-stone-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-800">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-sm">פתיחה למצב עריכה</h3>
              <p className="text-[11px] text-stone-500">נדרשת סיסמה לביצוע שינויים</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3.5">
          <p className="text-xs text-stone-600 leading-relaxed">
            עץ המשפחה נמצא כעת ב<strong>מצב צפייה נעול</strong>. כדי להוסיף, לערוך או למחוק נתונים, נא להזין את סיסמת העריכה:
          </p>

          <div>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="הזן סיסמת עריכה..."
                className={`w-full px-3 py-2.5 pl-10 text-sm font-mono bg-white border rounded-xl outline-none transition-all placeholder:text-stone-300 ${
                  error
                    ? 'border-rose-400 focus:ring-2 focus:ring-rose-200 text-rose-900'
                    : 'border-stone-300 focus:border-stone-500 focus:ring-2 focus:ring-stone-200 text-stone-900'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                tabIndex={-1}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 transition-colors"
                title={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-rose-600 font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
            >
              ביטול
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold bg-stone-900 hover:bg-stone-800 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>פתח לעריכה</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
