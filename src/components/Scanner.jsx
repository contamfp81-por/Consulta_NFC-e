import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '../db';
import { processNFCeURL, autoCategorize } from '../utils/scraper';
import { Camera, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon, RotateCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Scanner = ({ onComplete }) => {
    const [cameras, setCameras] = useState([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [status, setStatus] = useState('idle'); // idle, scanning, processing, success, error
    const [errorMessage, setErrorMessage] = useState('');
    const scannerRef = useRef(null);
    const fileInputRef = useRef(null);

    const loadCameras = async () => {
        try {
            // Explictly request permission to unlock all lenses
            await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then(stream => {
                    stream.getTracks().forEach(track => track.stop());
                });

            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length > 0) {
                setCameras(devices);

                // Smart auto-selection: prioritize back cameras
                const backCam = devices.find(d =>
                    d.label.toLowerCase().includes('back') ||
                    d.label.toLowerCase().includes('traseira') ||
                    d.label.toLowerCase().includes('rear') ||
                    d.label.toLowerCase().includes('environment')
                ) || devices[0];

                setSelectedCameraId(backCam.id);
            }
        } catch (err) {
            console.error("Erro ao buscar câmeras:", err);
            // Don't set error state here, user might want to use file upload instead
        }
    };

    useEffect(() => {
        loadCameras();
        return () => stopScanner();
    }, []);

    // Effect to start scanner when status changes to scanning
    useEffect(() => {
        if (status === 'scanning' && selectedCameraId) {
            const start = async () => {
                try {
                    // Small delay to ensure DOM is ready
                    await new Promise(r => setTimeout(r, 400));

                    const element = document.getElementById("reader");
                    if (!element) {
                        throw new Error("Elemento do scanner não encontrado no DOM");
                    }

                    const newScanner = new Html5Qrcode("reader");
                    scannerRef.current = newScanner;

                    await newScanner.start(
                        selectedCameraId,
                        {
                            fps: 15,
                            qrbox: (viewfinderWidth, viewfinderHeight) => {
                                const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                                const size = Math.floor(minEdge * 0.7);
                                return { width: size, height: size };
                            },
                        },
                        async (decodedText) => {
                            await stopScanner();
                            handleQRCodeDecoded(decodedText);
                        },
                        () => { } // Ignora erros de leitura de frame
                    );
                } catch (err) {
                    console.error("Erro ao iniciar câmera:", err);
                    setStatus('error');
                    setErrorMessage('Falha ao acessar esta câmera. Tente outra ou verifique se não está em uso por outro app.');
                    stopScanner();
                }
            };
            start();
        }
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
        }
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setStatus('processing');

        try {
            const html5QrCode = new Html5Qrcode("reader-hidden");
            const decodedText = await html5QrCode.scanFile(file, true);
            html5QrCode.clear();
            handleQRCodeDecoded(decodedText);
        } catch (err) {
            console.error("Erro na leitura do arquivo:", err);
            setStatus('error');
            setErrorMessage('Não encontramos um QR Code nesta imagem. Certifique-se que esteja nítida.');
        }
    };

    const handleQRCodeDecoded = async (url) => {
        setStatus('processing');
        try {
            const data = await processNFCeURL(url);

            if (data.accessKey) {
                const existing = await db.receipts.where('accessKey').equals(data.accessKey).first();
                if (existing) {
                    setStatus('error');
                    setErrorMessage('Este cupom fiscal já está cadastrado.');
                    return;
                }
            }

            const receiptId = await db.receipts.add({
                establishment: data.establishment,
                date: data.date,
                totalValue: data.totalValue,
                url: url,
                accessKey: data.accessKey,
                receiptNumber: data.receiptNumber,
                isPartial: data.isPartial
            });

            if (data.products && data.products.length > 0) {
                const productsWithIds = data.products.map(p => ({
                    ...p,
                    receiptId,
                    category: autoCategorize(p.name)
                }));
                await db.products.bulkAdd(productsWithIds);
            }

            setStatus('success');
            setTimeout(() => onComplete(), 2000);
        } catch (err) {
            console.error("Erro no robô:", err);
            setStatus('error');
            setErrorMessage('Falha ao obter dados da SEFAZ. Verifique sua conexão.');
        }
    };

    return (
        <div className="animate-slide-up">
            <div id="reader-hidden" style={{ display: 'none' }}></div>

            <div className="glass-card" style={{ textAlign: 'center' }}>
                <h3 style={{ marginBottom: '15px' }}>Leitor NFC-e</h3>

                <AnimatePresence mode="wait">
                    {status === 'idle' && (
                        <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div style={{ marginBottom: '25px' }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '12px' }}>
                                    Lente Selecionada (Tente trocar se não focar)
                                </label>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                                    <select
                                        className="glass-card"
                                        style={{ flex: 1, padding: '12px', borderRadius: '12px', background: 'white', border: '1px solid #ddd' }}
                                        value={selectedCameraId}
                                        onChange={(e) => setSelectedCameraId(e.target.value)}
                                    >
                                        {cameras.length > 0 ? (
                                            cameras.map(cam => (
                                                <option key={cam.id} value={cam.id}>{cam.label || `Câmera ${cam.id}`}</option>
                                            ))
                                        ) : (
                                            <option value="">Detectando câmeras...</option>
                                        )}
                                    </select>
                                    <button
                                        onClick={loadCameras}
                                        className="btn-primary"
                                        style={{ width: '50px', padding: 0, background: '#eee' }}
                                    >
                                        <RotateCw size={20} color="var(--primary-blue)" />
                                    </button>
                                </div>
                                <button className="btn-primary" onClick={() => setStatus('scanning')}>
                                    <Camera size={20} /> Abrir Câmera
                                </button>
                            </div>

                            <div style={{ padding: '20px 0', borderTop: '1px solid #eee' }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '12px' }}>
                                    Ou use um arquivo de imagem
                                </label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                />
                                <button
                                    className="btn-primary"
                                    style={{ background: 'white', color: 'var(--primary-blue)', border: '1px solid #ddd' }}
                                    onClick={() => fileInputRef.current.click()}
                                >
                                    <ImageIcon size={20} /> Carregar QR Code
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {(status === 'scanning' || status === 'processing') && (
                        <motion.div key="loading" style={{ padding: '10px' }}>
                            {status === 'scanning' && (
                                <div id="reader" style={{ width: '100%', minHeight: '300px', borderRadius: '20px', overflow: 'hidden', background: '#000' }}></div>
                            )}
                            <div style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                                <Loader2 className="animate-spin" size={40} color="var(--primary-blue)" />
                                <p style={{ fontWeight: '600' }}>
                                    {status === 'scanning' ? 'Aguardando QR Code...' : 'Processando dados da nota...'}
                                </p>
                                <button
                                    onClick={async () => { await stopScanner(); setStatus('idle'); }}
                                    className="btn-primary"
                                    style={{ background: '#fefefe', color: '#ff5252', width: 'auto', padding: '10px 25px' }}
                                >
                                    <X size={18} /> Cancelar
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {status === 'success' && (
                        <motion.div key="success" style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <CheckCircle2 size={64} color="var(--success-emerald)" style={{ margin: '0 auto 20px' }} />
                            <h3 style={{ color: 'var(--success-emerald)' }}>Importado com Sucesso!</h3>
                        </motion.div>
                    )}

                    {status === 'error' && (
                        <motion.div key="error" style={{ padding: '40px 20px', textAlign: 'center' }}>
                            <AlertCircle size={64} color="#f44336" style={{ margin: '0 auto 20px' }} />
                            <h4 style={{ color: '#f44336', marginBottom: '10px' }}>Ops! Erro na leitura</h4>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: '20px' }}>{errorMessage}</p>
                            <button className="btn-primary" onClick={() => { setStatus('idle'); stopScanner(); }}>Tentar Novamente</button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Scanner;
