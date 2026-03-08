import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { db } from '../db';
import { processNFCeURL, autoCategorize } from '../utils/scraper';
import { Camera, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Scanner = ({ onComplete }) => {
    const [cameras, setCameras] = useState([]);
    const [selectedCameraId, setSelectedCameraId] = useState('');
    const [status, setStatus] = useState('idle'); // idle, scanning, processing, success, error
    const [errorMessage, setErrorMessage] = useState('');
    const [isScannerInitialized, setIsScannerInitialized] = useState(false);
    const scannerRef = useRef(null);
    const fileInputRef = useRef(null);

    const loadCameras = async () => {
        try {
            const devices = await Html5Qrcode.getCameras();
            if (devices && devices.length > 0) {
                // Filter and sort cameras to put back cameras first
                const sortedDevices = [...devices].sort((a, b) => {
                    const aLabel = a.label.toLowerCase();
                    const bLabel = b.label.toLowerCase();
                    const aIsBack = aLabel.includes('back') || aLabel.includes('traseira') || aLabel.includes('rear');
                    const bIsBack = bLabel.includes('back') || bLabel.includes('traseira') || bLabel.includes('rear');
                    if (aIsBack && !bIsBack) return -1;
                    if (!aIsBack && bIsBack) return 1;
                    return 0;
                });

                setCameras(sortedDevices);

                // Prioritize the best back camera (often the last one in some devices or first in others)
                const backCams = sortedDevices.filter(d =>
                    d.label.toLowerCase().includes('back') ||
                    d.label.toLowerCase().includes('traseira') ||
                    d.label.toLowerCase().includes('rear')
                );

                if (backCams.length > 0) {
                    setSelectedCameraId(backCams[0].id);
                } else {
                    setSelectedCameraId(sortedDevices[0].id);
                }
            }
        } catch (err) {
            console.error("Erro ao buscar câmeras", err);
        }
    };

    useEffect(() => {
        loadCameras();
    }, []);

    useEffect(() => {
        if (status === 'scanning' && selectedCameraId) {
            const start = async () => {
                try {
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
                        () => { }
                    );
                    setIsScannerInitialized(true);
                } catch (err) {
                    console.error("Erro ao iniciar scanner:", err);
                    setStatus('error');
                    setErrorMessage('Não foi possível iniciar a câmera. Verifique permissões.');
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

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setStatus('processing');
        const html5QrCode = new Html5Qrcode("reader-hidden");

        try {
            const decodedText = await html5QrCode.scanFile(file, true);
            handleQRCodeDecoded(decodedText);
        } catch (err) {
            console.error("Erro ao ler QR Code da imagem:", err);
            setStatus('error');
            setErrorMessage('Não foi possível encontrar um QR Code válido nesta imagem.');
        } finally {
            html5QrCode.clear();
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
                    setErrorMessage('Este cupom fiscal já foi cadastrado anteriormente.');
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
            console.error("Erro no processamento", err);
            setStatus('error');
            setErrorMessage('O Robô falhou ao extrair dados. Tente outra câmera ou imagem mais nítida.');
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
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '12px', fontWeight: 'bold' }}>
                                    Opção 1: Usar Câmera
                                </label>
                                <select
                                    className="glass-card"
                                    style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '12px', background: 'white', border: '1px solid #ddd' }}
                                    value={selectedCameraId}
                                    onChange={(e) => setSelectedCameraId(e.target.value)}
                                >
                                    {cameras.map(cam => (
                                        <option key={cam.id} value={cam.id}>
                                            {cam.label || `Câmera ${cam.id}`}
                                        </option>
                                    ))}
                                </select>
                                <button className="btn-primary" onClick={() => setStatus('scanning')}>
                                    <Camera size={20} /> Abrir Câmera
                                </button>
                            </div>

                            <div style={{ padding: '20px 0', borderTop: '1px solid #eee' }}>
                                <label style={{ fontSize: '0.85rem', color: 'var(--text-light)', display: 'block', marginBottom: '12px', fontWeight: 'bold' }}>
                                    Opção 2: Carregar Foto
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
                                    style={{ background: 'var(--white)', color: 'var(--primary-blue)', border: '1px solid var(--primary-blue)' }}
                                    onClick={() => fileInputRef.current.click()}
                                >
                                    <ImageIcon size={20} /> Selecionar Imagem
                                </button>
                                <p style={{ fontSize: '0.75rem', marginTop: '10px', color: 'var(--text-light)' }}>
                                    Útil para prints ou fotos da galeria
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {(status === 'scanning' || status === 'processing') && (
                        <motion.div key="loading" style={{ padding: '10px' }}>
                            <div id="reader" style={{ width: '100%', minHeight: '300px', borderRadius: '20px', overflow: 'hidden', background: '#000', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}></div>
                            <div style={{ marginTop: '25px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                                <Loader2 className="animate-spin" size={40} color="var(--primary-blue)" />
                                <p style={{ fontWeight: '500' }}>{status === 'scanning' ? 'Aponte para o QR Code...' : 'Robô processando nota...'}</p>
                                {status === 'scanning' && (
                                    <button
                                        onClick={() => { stopScanner(); setStatus('idle'); }}
                                        style={{ background: 'none', border: 'none', color: '#ff5252', fontSize: '0.9rem', fontWeight: 'bold', cursor: 'pointer' }}
                                    >
                                        Cancelar
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {status === 'success' && (
                        <motion.div key="success" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                            <div style={{ background: 'rgba(46, 125, 50, 0.1)', padding: '20px', borderRadius: '50%' }}>
                                <CheckCircle2 size={64} color="var(--success-emerald)" />
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <h3 style={{ color: 'var(--success-emerald)', marginBottom: '5px' }}>Importado!</h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-light)' }}>Sincronizado com SEFAZ PR</p>
                            </div>
                        </motion.div>
                    )}

                    {status === 'error' && (
                        <motion.div key="error" style={{ padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                            <AlertCircle size={64} color="#f44336" />
                            <div style={{ textAlign: 'center' }}>
                                <h4 style={{ color: '#f44336', marginBottom: '10px' }}>Falha na Leitura</h4>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-light)', marginBottom: '20px' }}>{errorMessage}</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                                <button className="btn-primary" style={{ flex: 1 }} onClick={() => setStatus('idle')}>Tentar De Novo</button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Scanner;
