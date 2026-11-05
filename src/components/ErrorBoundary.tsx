import { Component, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { t } from '@/i18n/t';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: import.meta.env.DEV
        ? error.message
        : t('common.errorBoundaryHint'),
    };
  }

  componentDidCatch(error: Error) {
    if (import.meta.env.DEV) {
      console.error('App error:', error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4 bg-aypik-banner-bg">
          <div className="max-w-md text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">
              {t('common.errorOccurred')}
            </h1>
            <p className="text-gray-500 text-sm mb-4">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 btn-primary"
            >
              <span>{t('common.reloadPage')}</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
