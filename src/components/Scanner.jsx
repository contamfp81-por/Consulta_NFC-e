import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '../db';
import { processNFCeURL, autoCategorize } from '../utils/scraper';
import { Camera, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Scanner = ({ onComplete }) => {
    const [cameras, setCameras] = useState([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [status, setStatus] = useState('idle'); // idle, scanning, processing, success, error
    const [errorMessage, setErrorMessage] = useState('');
    const [isScannerInitialized, setIsScannerInitialized] = useState(false);
    const scannerRef = useRef(null);

    const loadCameras = async () => {
        try {
            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length > 0) {
                setCameras(devices);
                // Prioritize back camera
                const backCam = devices.find(d => d.label.toLowerCase().includes('back'));
                setSelectedCameraId(backCam ? backCam.id : devices[0].id);
            }
        } catch (err) {
            console.error("Erro ao buscar câmeras", err);
            // Don't show error yet, user might need to click "Abrir" to trigger permission
        }
    };

    useEffect(() => {
        loadCameras();
    }, []);

    useEffect(() => {
        if (status === 'scanning' && selectedCameraId) {
            const start = async () => {
                try {
                    // Give a small moment for the DOM to be ready if it was hidden
                    await new Promise(r => setTimeout(r, 300));

                    const newScanner = new Html5Qrcode("reader");
                    scannerRef.current = newScanner;

                    await newScanner.start(
                        selectedCameraId,
                        {
                            fps: 10,
                            qrbox: { width: 250, height: 250 },
                            aspectRatio: 1.0
                        },
                        async (decodedText) => {
                            await stopScanner();
                            handleQRCodeDecoded(decodedText);
                        },
                        () => { } // Ignore scan errors
                    );
                    setIsScannerInitialized(true);
                } catch (err) {
                    console.error("Erro ao iniciar scanner:", err);
                    setStatus('error');
                    setErrorMessage('Não foi possível iniciar a câmera. Verifique se o site tem permissão de acesso.');
                }
            };
            start();
        }

        return () => {
            stopScanner();
        };
    }, [status, selectedCameraId]);

    const stopScanner = async () => {
        if (scannerRef.current) {
            try {
                if (scannerRef.current.isScanning) {
                    await scannerRef.current.stop();
                }
            } catch (e) {
                console.error("Erro ao parar scanner:", e);
            }
            scannerRef.current = null;
            setIsScannerInitialized(false);
        }
    };

    const startScanning = () => {
        if (cameras.length === 0) {
            loadCameras(); // Attempt to load if not loaded
        }
        setStatus('scanning');
    };

    const handleQRCodeDecoded = async (url) => {
        setStatus('processing');
        try {
            const data = await processNFCeURL(url);

            // Persist to DB
            const receiptId = await db.receipts.add({
                establishment: data.establishment,
                date: data.date,
                totalValue: data.totalValue,
                url: url
            });

            const productsWithIds = data.products.map(p => ({
                ...p,
                receiptId,
                category: autoCategorize(p.name)
            }));

            await db.products.bulkAdd(productsWithIds);

            setStatus('success');
            setTimeout(() => onComplete(), 1500);
        } catch (err) {
            console.error("Erro no processamento", err);
            setStatus('error');
            setErrorMessage('O Robô falhou ao processar este cupom. Tente novamente.');
        }
    };

    return (
        <div className="animate-slide-up">
            <div className="glass-card" style={{ textAlign: 'center' }}>
                <h3 style={{ marginBottom: '15px' }}>Leitor NFC-e</h3>

                <AnimatePresence mode="wait">
                    {status === 'idle' && (
                        <motion.div key="idle">
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ fontSize: '0.8rem', color: 'var(--text-light)', display: 'block', marginBottom: '8px' }}>
                                    Selecione a Câmera
                                </label>
                                <select
                                    className="glass-card"
                                    style={{ width: '100%', padding: '10px', marginBottom: '20px', borderRadius: '10px' }}
                                    value={selectedCameraId}
                                    onChange={(e) => setSelectedCameraId(e.target.value)}
                                >
                                    {cameras.map(cam => (
                                        <option key={cam.id} value={cam.id}>{cam.label || `Câmera ${cam.id}`}</option>
                                    ))}
                                </select>
                            </div>
                            <button className="btn-primary" onClick={startScanning}>
                                <Camera /> Abrir Câmera
                            </button>
                        </motion.div>
                    )}

                    {(status === 'scanning' || status === 'processing') && (
                        <motion.div key="loading" style={{ padding: '20px' }}>
                            <div id="reader" style={{ width: '100%', minHeight: '300px', borderRadius: '15px', overflow: 'hidden', background: '#000' }}></div>
                            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                <Loader2 className="animate-spin" size={48} color="var(--secondary-cyan)" />
                                <p>{status === 'scanning' ? 'Aponte para o QR Code...' : 'Robô processando SEFAZ...'}</p>
                            </div>
                        </motion.div>
                    )}

                    {status === 'success' && (
                        <motion.div key="success" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                            <CheckCircle2 size={64} color="var(--success-emerald)" />
                            <h4 style={{ color: 'var(--success-emerald)' }}>Importado com Sucesso!</h4>
                            <p style={{ fontSize: '0.9rem' }}>Os dados foram processados pelo robô.</p>
                        </motion.div>
                    )}

                    {status === 'error' && (
                        <motion.div key="error" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                            <AlertCircle size={64} color="#f44336" />
                            <h4 style={{ color: '#f44336' }}>Ops! Algo deu errado</h4>
                            <p style={{ fontSize: '0.9rem' }}>{errorMessage}</p>
                            <button className="btn-primary" onClick={() => setStatus('idle')}>Tentar Novamente</button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Scanner;
