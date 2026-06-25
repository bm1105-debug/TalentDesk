import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center p-8">
        <div className="bg-[#0d1117] border border-red-500/20 rounded-xl p-8 max-w-md text-center space-y-4">
          <p className="text-2xl font-bold text-red-400">Something went wrong</p>
          <p className="text-sm text-slate-400">{this.state.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    )
  }
}
