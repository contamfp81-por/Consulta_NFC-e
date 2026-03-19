import React, { Component } from 'react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="premium-surface" style={{ textAlign: 'center', marginTop: '12px' }}>
                    <h2 style={{ color: 'var(--danger-red)', marginBottom: '8px' }}>Algo deu errado no componente.</h2>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', margin: '10px 0' }}>
                        {this.state.error?.message || "Erro desconhecido"}
                    </p>
                    <button
                        className="btn-primary"
                        onClick={() => window.location.reload()}
                        style={{ marginTop: '10px' }}
                    >
                        Recarregar App
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
