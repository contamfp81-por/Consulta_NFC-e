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
                <div style={{ padding: '20px', textAlign: 'center', background: '#fff', borderRadius: '15px', margin: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    <h2 style={{ color: '#ff5252' }}>Algo deu errado no componente.</h2>
                    <p style={{ fontSize: '0.9rem', color: '#666', margin: '10px 0' }}>
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
