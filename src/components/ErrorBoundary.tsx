import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in application:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetLocalData = () => {
    try {
      localStorage.removeItem('family_tree_yehuda_v1');
    } catch (e) {
      console.warn(e);
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 w-full h-full flex items-center justify-center bg-stone-100 p-4 font-sans text-stone-900 select-none">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-md w-full p-6 text-center space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div>
              <h2 className="text-lg font-bold font-hebrew-serif text-stone-900">
                אירעה שגיאה בטעינת אילן היוחסין
              </h2>
              <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                היישום נתקל בשגיאה בעת הצגת הנתונים. הנתונים שלך שמורים במסד הנתונים של השרת.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="p-3 bg-stone-50 rounded-lg text-stone-600 text-xs font-mono text-right overflow-x-auto border border-stone-200 max-h-28">
                {this.state.error.message}
              </div>
            )}

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 bg-stone-900 hover:bg-stone-800 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs"
              >
                <RefreshCw className="w-4 h-4" />
                <span>טען את העמוד מחדש</span>
              </button>

              <button
                type="button"
                onClick={this.handleResetLocalData}
                className="w-full py-2 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-3.5 h-3.5 text-stone-500" />
                <span>רענן נתונים ישירות מהשרת (איפוס מטמון מקומי)</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
